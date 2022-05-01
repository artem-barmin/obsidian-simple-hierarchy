import {
    App,
    ListItemCache,
    MarkdownView,
    Plugin,
    TagCache,
    TFile,
    WorkspaceLeaf,
    ItemView,
} from "obsidian";
import _ from "lodash";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import * as Visuals from "./visuals";
import { hoverPreview, openOrSwitch } from "obsidian-community-lib";

interface MyPluginSettings {
    mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: "default",
};

function findSection(line: number, section: ListItemCache) {
    return (
        section.position.start.line <= line && section.position.end.line >= line
    );
}

function drawLink(view, target) {
    return (
        <span
            className="cm-hmd-internal-link"
            onClick={async (e) => await openOrSwitch(target, e)}
            onMouseOver={(e) => hoverPreview(e, view, target)}
        >
            <span
                className="data-link-text"
                data-link-tags=""
                data-link-data-href={target}
                data-link-path={target}
            >
                <span className="cm-underline">
                    <span>{target}</span>
                </span>
            </span>
        </span>
    );
}

function getAllChildrensOfBlock(
    parents: ListItemCache[],
    allItems: ListItemCache[]
): ListItemCache[] {
    if (!parents.length) return [];

    const idx = new Set(parents.map((parent) => parent.position.start.line));
    const childrens = allItems.filter(({ parent }) => idx.has(parent));

    const nestedChildrens = getAllChildrensOfBlock(childrens, allItems);

    return _.uniq([...parents, ...childrens, ...nestedChildrens]);
}

function getBasenameByPath(app, path) {
    const rootFile: TFile = app.vault.getAbstractFileByPath(path) as TFile;
    return rootFile.basename;
}

function suggestMocsForCurrentFile(
    app: App,
    parentChildCache: ParentChildCache,
    current: TFile
) {
    const meta = app.metadataCache.getCache(current.path);

    // get all links for "current" file - incoming, outcoming, embeds
    const incomingLinks = _.map(
        _.keys(
            _.pickBy(
                app.metadataCache.resolvedLinks,
                (links) => !!links[current.path]
            )
        ),
        _.partial(getBasenameByPath, app)
    );

    const outgoingLinks = _.map(_.concat(meta.links, meta.embeds), "link");

    const allFileLinks = _.concat(incomingLinks, outgoingLinks);

    // check if any direct link is MOC(but file is not it the section #moc)
    const allDirectMOCs = _.mapValues(
        _.pick(parentChildCache, allFileLinks),
        (_links, moc) => {
            return { moc, connected: [], score: 1, type: "direct" };
        }
    );

    // check if any direct links we have MOC-related items - get their parent MOCs
    const allLinksWithMOCs = _.pickBy(
        _.mapValues(parentChildCache, (links, moc) => {
            const connected = _.intersection(links, allFileLinks);
            return { moc, connected, score: connected.length, type: "through" };
        }),
        "score"
    );

    // sort by amount of "co-related" links
    return _.sortBy(_.values(_.merge(allLinksWithMOCs, allDirectMOCs)), [
        "type",
        "score",
    ]);
}

function refreshCacheForFile(
    app: App,
    path: string,
    parentChildCache: ParentChildCache
) {
    const meta = app.metadataCache.getCache(path);
    const basename = getBasenameByPath(app, path);
    const tags = meta.tags || [];
    const mocTags: number[] = _.map(
        _.filter(tags, { tag: "#moc" }),
        (tag: TagCache) => tag.position.start.line
    );
    if (mocTags.length) {
        // find list item that have #moc tag
        const itemsWithMoc: ListItemCache[] = _.compact(
            mocTags.map((tagLine: number) => {
                return meta.listItems?.find(_.partial(findSection, tagLine));
            })
        );

        const fileLinksAndEmbeds = _.concat(
            meta.links || [],
            meta.embeds || []
        );

        // TODO: section level moc
        if (itemsWithMoc.length) {
            // it's a list level moc
            // find all nested list items
            const allNestedItemsOfMoc = itemsWithMoc.map((item) => ({
                item,
                nested: getAllChildrensOfBlock([item], meta.listItems),
            }));

            // find all links that belongs to #moc branch
            const allLinks = allNestedItemsOfMoc.map(({ item, nested }) => {
                const links = fileLinksAndEmbeds.filter((link) =>
                    nested.find(
                        _.partial(findSection, link.position.start.line)
                    )
                );
                return { item, links };
            });

            // TODO: get "item" text and use as category
            // add them to "parent->child" relation
            parentChildCache[basename] = _.map(
                _.flatMap(allLinks, "links"),
                "link"
            );
        } else {
            // it's a file level #moc
            parentChildCache[basename] = _.map(fileLinksAndEmbeds, "link");
        }
    } else {
        delete parentChildCache[basename];
    }
}

interface ParentChildCache {
    [key: string]: string[];
}

function getAllParents(
    path: string,
    relations: ParentChildCache
): Visuals.Breadcrumbs[] {
    const getParentsForCurrentPath = (path: string) =>
        _.keys(_.pickBy(relations, (child) => _.includes(child, path)));
    const allParents = (
        path: string,
        currentPath: string[]
    ): Visuals.Breadcrumbs[] => {
        const parents = getParentsForCurrentPath(path);
        if (!parents.length) return [currentPath];
        return _.flatMap(parents, (p) => allParents(p, [p, ...currentPath]));
    };
    return _.filter(_.sortBy(allParents(path, [])), "length");
}

const NOT_ASSIGNED_VIEW = "NOT_ASSIGNED_VIEW";

function RenderList({ items, drawLink }: { items: string[] }) {
    return (
        <div className="markdown-source-view mod-cm6 cm-s-obsidian">
            <div>
                <b>Total:</b> {items.length}
            </div>
            {items.map((item) => (
                <div>{drawLink(item)}</div>
            ))}
        </div>
    );
}

export class NotAssignedHierarchyView extends ItemView {
    root: Root;
    parentChildCache: ParentChildCache;

    constructor(leaf: WorkspaceLeaf, parentChildCache: ParentChildCache) {
        super(leaf);
        this.parentChildCache = parentChildCache;
    }

    async onload(): Promise<void> {
        super.onload();
        this.app.workspace.onLayoutReady(() => {
            this.root = createRoot(this.contentEl);
            this.draw();
        });
        this.app.metadataCache.on("changed", this.draw);
        this.app.metadataCache.on("resolve", this.draw);
    }

    getViewType() {
        return NOT_ASSIGNED_VIEW;
    }

    getDisplayText() {
        return "Non Assigned Hierarchy";
    }

    draw = () => {
        const allMentionedItems = _.concat(
            _.flatten(_.values(this.parentChildCache)),
            _.keys(this.parentChildCache)
        );

        const allFiles = _.keys(this.app.metadataCache.resolvedLinks);

        const allFilteredFiles = _.compact(
            _.map(allFiles, (path) => {
                const meta = this.app.metadataCache.getCache(path);
                if (
                    !_.find(meta.tags, ({ tag }) =>
                        _.includes(["#daily", "#blog"], tag)
                    )
                )
                    return getBasenameByPath(this.app, path);
            })
        );

        const notMentioned = _.difference(allFilteredFiles, allMentionedItems);
        this.root.render(
            <RenderList
                drawLink={_.partial(drawLink, this.leaf.view)}
                items={notMentioned}
            />
        );
    };
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    leafsWithBreadcrumbs: {
        view: MarkdownView;
        root: Root;
        afterRender: () => void;
    }[];
    parentChildCache: ParentChildCache;

    createLeaf = (leaf: WorkspaceLeaf) => {
        if (leaf.view instanceof MarkdownView) {
            const view = leaf.view;
            const rootEl = leaf.view.containerEl.querySelector(
                ".simple-hierarchy-breadcrumbs"
            );
            if (!rootEl) {
                const container = view.containerEl;
                const parent = container.querySelector(".cm-contentContainer");

                const newElement = document.createElement("div");
                newElement.className = "simple-hierarchy-breadcrumbs";

                parent.firstChild?.before(newElement);
                const root = createRoot(newElement);

                const matchHeight = () => {
                    const cmGutter = container.querySelector(".cm-gutters");
                    if (newElement.offsetHeight > 0 && cmGutter)
                        cmGutter.style.paddingTop = `${newElement.offsetHeight}px`;
                };

                const refreshCursor = () => {
                    view.editor.setCursor(view.editor.getCursor());
                };

                this.leafsWithBreadcrumbs.push({
                    view,
                    root,
                    afterRender: () => {
                        matchHeight();
                        refreshCursor();
                    },
                });
            }
        }
    };

    createAllLeafs = () => {
        const leafs = this.app.workspace.getLeavesOfType("markdown");
        leafs.forEach(this.createLeaf);
        this.refreshAllLeafs();
    };

    refreshAllLeafs = () => {
        this.leafsWithBreadcrumbs.forEach(({ view, root, afterRender }) => {
            // TODO: check case of the same names in different folders
            if (view.file) {
                const relations = getAllParents(
                    view.file.basename,
                    this.parentChildCache
                );
                if (relations.length)
                    root.render(
                        <Visuals.Matrix
                            drawLink={(link) => drawLink(view, link)}
                            file={view.file.basename}
                            relations={relations}
                        />
                    );
                else {
                    const suggestions = suggestMocsForCurrentFile(
                        this.app,
                        this.parentChildCache,
                        view.file
                    );
                    root.render(
                        <Visuals.Suggestions
                            drawLink={(link) => drawLink(view, link)}
                            suggestions={suggestions}
                        />
                    );
                }
                requestIdleCallback(afterRender);
            }
        });
    };

    refreshCache = () => {
        _.map(app.metadataCache.resolvedLinks, (_links, path: string) =>
            refreshCacheForFile(app, path, this.parentChildCache)
        );
        this.refreshAllLeafs();
    };

    async onload() {
        await this.loadSettings();
        this.leafsWithBreadcrumbs = [];
        this.parentChildCache = {};
        const app = this.app;

        app.metadataCache.on("changed", this.refreshCache);
        app.metadataCache.on("resolve", this.refreshCache);
        app.workspace.on("active-leaf-change", this.createAllLeafs);
        app.workspace.on("file-open", this.createAllLeafs);

        this.registerView(
            NOT_ASSIGNED_VIEW,
            (leaf) => new NotAssignedHierarchyView(leaf, this.parentChildCache)
        );

        this.refreshCache();
        this.createAllLeafs();
    }

    onunload() {
        app.metadataCache.off("changed", this.refreshCache);
        app.workspace.off("active-leaf-change", this.createAllLeafs);
        app.workspace.off("file-open", this.createAllLeafs);
        this.leafsWithBreadcrumbs.forEach(({ root }) => root.unmount());
        document
            .querySelectorAll(".simple-hierarchy-breadcrumbs")
            .forEach((e) => e.remove());
        this.leafsWithBreadcrumbs = [];
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
