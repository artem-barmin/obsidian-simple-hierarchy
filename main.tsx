import {
    App,
    ListItemCache,
    MarkdownView,
    Plugin,
    PluginSettingTab,
    Setting,
    TagCache,
    TFile,
} from "obsidian";
import _ from "lodash";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";

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

function buildTreeCache(app: App, parentChildCache: ParentChildCache) {
    _.map(app.metadataCache.resolvedLinks, (_links, path: string) =>
        refreshCacheForFile(app, path, parentChildCache)
    );
}

interface ParentChildCache {
    [key: string]: string[];
}

function getAllParents(path: string, relations: ParentChildCache) {
    const getParent = (path: string) =>
        _.keys(_.pickBy(relations, (child) => _.includes(child, path)));
    const allParents = (level: number, path: string) => {
        const parents = getParent(path);
        if (!parents.length) return [];
        return [
            { level, parents, path },
            ..._.flatMap(parents, _.partial(allParents, level + 1)),
        ];
    };
    return allParents(0, path);
}

function Breadcrumbs({ file, relations, counter }) {
    return <div>{JSON.stringify(getAllParents(file, relations))}</div>;
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    leafsWithBreadcrumbs: { view: MarkdownView; root: Root }[];

    async onload() {
        await this.loadSettings();
        this.leafsWithBreadcrumbs = [];
        const parentChildCache = {};
        const app = this.app;
        buildTreeCache(app, parentChildCache);

        console.log(">>>>", parentChildCache);

        let counter = 0;

        const refreshAllLeafs = () => {
            this.leafsWithBreadcrumbs.forEach(({ view, root }) =>
                // TODO: check case of the same names in different folders
                root.render(
                    <Breadcrumbs
                        file={view.file.basename}
                        relations={parentChildCache}
                        counter={counter++}
                    />
                )
            );
        };

        app.workspace.on("active-leaf-change", (leaf) => {
            const rootEl = leaf.view.containerEl.querySelector(
                ".simple-hierarchy-breadcrumbs"
            );
            if (leaf.view instanceof MarkdownView) {
                if (!rootEl) {
                    const parent = leaf.view.containerEl.querySelector(
                        "div.cm-contentContainer"
                    );

                    const newElement = document.createElement("div");
                    newElement.className = "simple-hierarchy-breadcrumbs";

                    parent.firstChild?.before(newElement);
                    const root = createRoot(newElement);

                    this.leafsWithBreadcrumbs.push({ view: leaf.view, root });
                } else if (
                    rootEl &&
                    !_.find(this.leafsWithBreadcrumbs, { view: leaf.view })
                ) {
                    const root = createRoot(rootEl);
                    this.leafsWithBreadcrumbs.push({ view: leaf.view, root });
                }
                refreshAllLeafs();
            }
        });

        app.workspace.on("file-open", (file) => {
            console.log("file opened", file.path);
        });

        app.workspace.on("editor-change", () => {
            buildTreeCache(app, parentChildCache);
        });
    }

    onunload() {
        app.workspace.off("file-open");
        app.workspace.off("active-leaf-change");
        app.workspace.off("editor-change");
        this.leafsWithBreadcrumbs.forEach(({ root }) => root.unmount());
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

class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl("h2", { text: "Settings for my awesome plugin." });

        new Setting(containerEl)
            .setName("Setting #1")
            .setDesc("It's a secret")
            .addText((text) =>
                text
                    .setPlaceholder("Enter your secret")
                    .setValue(this.plugin.settings.mySetting)
                    .onChange(async (value) => {
                        console.log("Secret: " + value);
                        this.plugin.settings.mySetting = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
