# Design principles

1. Convention over configuration
2. As many defaults as possible, as less settings as possible
3. "Install and use" approach
4. Rich multi-hierarchy visulatisations(treemaps, wiki-style, matrix trees)
5. Help with Inteligence augumentation mechanisms: automatic graph analysis, etc
6. Use only Obsidian cache and make it as fast as possible

# Ideas

1. Automatically detect communities: https://graphology.github.io/standard-library/communities-louvain (auto-MOCs)
    - automatically set tags for groups of pages
    - augument graph view with different colors for this groups
2. Detect cycles in graph
3. Simple metrics that describes current PKM graph https://graphology.github.io/standard-library/metrics
    - centrality

# Settings

-   Tags for MOC defition. Default: #moc
-   Matrix/breadcrumbs view: left-right VS right-left
-   Tag for skip suggestion block for some files. Default: #root-moc
-   List length to show in suggestion. Default: 100
