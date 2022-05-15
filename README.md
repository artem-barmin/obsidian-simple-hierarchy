# Design principles

1. Convention over configuration
2. As many defaults as possible
3. Less than 500 lines of code
4. "Install and use" approach
5. Rich multi-hierarchy visulatisations(treemaps, etc)

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
