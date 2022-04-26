import {
    App,
    ListItemCache,
    MarkdownView,
    Plugin,
    TagCache,
    TFile,
    WorkspaceLeaf,
} from "obsidian";
import _ from "lodash";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import * as Visuals from "./visuals";

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

function refreshCacheForFile(
    app: App,
    path: string,
    parentChildCache: ParentChildCache
) {
    const meta = app.metadataCache.getCache(path);
    const rootFile: TFile = app.vault.getAbstractFileByPath(path) as TFile;
    const tags = meta.tags || [];
    const mocTags: number[] = _.map(
        _.filter(tags, { tag: "#moc" }),
        (tag: TagCache) => tag.position.start.line
    );
    if (mocTags.length) {
        // find list item that have #moc tag
        const itemsWithMoc: ListItemCache[] = mocTags.map((tagLine: number) => {
            return meta.listItems.find(_.partial(findSection, tagLine));
        });

        // find all nested list items
        const allNestedItemsOfMoc = itemsWithMoc.map((item) => ({
            item,
            nested: getAllChildrensOfBlock([item], meta.listItems),
        }));

        // find all links that belongs to #moc branch
        const allLinks = allNestedItemsOfMoc.map(({ item, nested }) => {
            const links = meta.links.filter((link) =>
                nested.find(_.partial(findSection, link.position.start.line))
            );
            return { item, links };
        });

        // TODO: get "item" text and use as category
        // add them to "parent->child" relation
        parentChildCache[rootFile.basename] = _.map(
            _.flatMap(allLinks, "links"),
            "link"
        );
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
    return allParents(path, [path]);
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    leafsWithBreadcrumbs: { view: MarkdownView; root: Root }[];
    parentChildCache: ParentChildCache;

    createLeaf = (leaf: WorkspaceLeaf) => {
        if (leaf.view instanceof MarkdownView) {
            const rootEl = leaf.view.containerEl.querySelector(
                ".simple-hierarchy-breadcrumbs"
            );
            if (!rootEl) {
                const container = leaf.view.containerEl;
                const parent = container.querySelector(
                    "div.cm-contentContainer"
                );

                const newElement = document.createElement("div");
                newElement.className = "simple-hierarchy-breadcrumbs";

                parent.firstChild?.before(newElement);
                const root = createRoot(newElement);

                const cmGutter = container.querySelector("div.cm-gutters");
                const correctHeight = () => {
                    cmGutter.style.paddingTop = `${newElement.offsetHeight}px`;
                };
                new ResizeObserver(correctHeight).observe(newElement);
                new MutationObserver(correctHeight).observe(cmGutter, {
                    attributes: true,
                    attributeFilter: ["style"],
                });

                this.leafsWithBreadcrumbs.push({ view: leaf.view, root });
            }
            this.refreshAllLeafs();
        }
    };

    createAllLeafs = () => {
        const leafs = this.app.workspace.getLeavesOfType("markdown");
        leafs.forEach(this.createLeaf);
    };

    refreshAllLeafs = () => {
        this.leafsWithBreadcrumbs.forEach(({ view, root }) =>
            // TODO: check case of the same names in different folders
            root.render(
                <Visuals.SimplePath
                    file={view.file.basename}
                    relations={getAllParents(
                        view.file.basename,
                        this.parentChildCache
                    )}
                />
            )
        );
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

        app.workspace.on("file-open", this.createAllLeafs);
        app.workspace.on("editor-change", this.refreshCache);

        this.refreshCache();
        this.createAllLeafs();
    }

    onunload() {
        app.workspace.off("file-open", this.createAllLeafs);
        app.workspace.off("editor-change", this.refreshCache);
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
