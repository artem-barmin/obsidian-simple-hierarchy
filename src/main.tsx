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

function linkClick(view, target) {
    return {
        onClick: (e) => openOrSwitch(target, e),
        onMouseOver: (e) => hoverPreview(e, view, target),
    };
}

function drawLink(view, target, id?) {
    return (
        <span
            className="cm-hmd-internal-link"
            id={id}
            {...linkClick(view, target)}
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

    // gather all suggestions and remove current file
    const suggestedMOCs = _.values(_.merge(allLinksWithMOCs, allDirectMOCs));
    const suggestedMOCsWithoutCurrent = _.filter(
        suggestedMOCs,
        ({ moc }) => moc !== current.basename
    );

    // sort by amount of "co-related" links
    return _.sortBy(suggestedMOCsWithoutCurrent, ["type", "score"]);
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
    const visited = new Set();
    const allParents = (
        path: string,
        currentPath: string[]
    ): Visuals.Breadcrumbs[] => {
        const parents = getParentsForCurrentPath(path);
        if (visited.has(path)) return [currentPath];
        if (!parents.length) return [currentPath];
        visited.add(path);
        return _.flatMap(parents, (p) => allParents(p, [p, ...currentPath]));
    };
    return _.filter(_.sortBy(allParents(path, [])), "length");
}

const NOT_ASSIGNED_VIEW = "NOT_ASSIGNED_VIEW";

function RenderList({
    items,
    linkClick,
    drawLink,
}: {
    items: { link: string; suggestions: number }[];
}) {
    return (
        <div className="embedded-backlinks">
            <div className="markdown-source-view mod-cm6 cm-s-obsidian backlink-pane">
                <div>
                    <b>Total:</b> {items.length}
                </div>
                {items.map(({ link, suggestions }, i) => (
                    <div
                        key={"suggestion" + i}
                        className="tree-item-self search-result-file-match"
                        {...linkClick(link)}
                    >
                        <div className="tree-item-inner">{drawLink(link)}</div>
                        <div className="tree-item-flair-outer">
                            <span className="tree-item-flair">
                                {suggestions}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
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
        this.app.metadataCache.on("resolved", this.draw);
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
        const suggestions = _.fromPairs(
            notMentioned.map((path) => [
                path,
                suggestMocsForCurrentFile(
                    this.app,
                    this.parentChildCache,
                    this.app.metadataCache.getFirstLinkpathDest(path, "")
                ).length,
            ])
        );

        const itemsWithSuggestions = _.orderBy(
            _.map(notMentioned, (link) => ({
                link,
                suggestions: suggestions[link],
            })),
            ["suggestions"],
            ["desc"]
        );

        this.root.render(
            <RenderList
                drawLink={_.partial(drawLink, this.leaf.view)}
                linkClick={_.partial(linkClick, this.leaf.view)}
                items={itemsWithSuggestions}
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
                    if (newElement.offsetHeight >= 0 && cmGutter)
                        cmGutter.style.paddingTop = `${newElement.offsetHeight}px`;
                };

                const refreshCursor = () => {
                    if (
                        leaf.view ==
                        this.app.workspace.getActiveViewOfType(MarkdownView)
                    )
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
                const meta = app.metadataCache.getFileCache(view.file);
                if (_.find(meta.tags, { tag: "#root-moc" }))
                    root.render(<div />);
                else if (relations.length)
                    root.render(
                        <Visuals.Matrix
                            drawLink={_.partial(drawLink, view)}
                            linkClick={_.partial(linkClick, view)}
                            file={view.file.basename}
                            relations={relations}
                            direction={"right-left"}
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
                            drawLink={_.partial(drawLink, view)}
                            linkClick={_.partial(linkClick, view)}
                            suggestions={suggestions}
                        />
                    );
                }
                requestAnimationFrame(afterRender);
                setTimeout(afterRender, 100);
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

        app.metadataCache.on("resolved", this.refreshCache);
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
