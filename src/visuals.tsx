import * as React from "react";
import _ from "lodash";
import Xarrow from "react-xarrows";

export type LinkClickFn = (link: string) => {
    onClick: React.MouseEventHandler<HTMLDivElement>;
    onMouseOver: React.MouseEventHandler<HTMLDivElement>;
};

interface BreadcrumbsProps {
    file: string;
    relations: Breadcrumbs[];
    drawLink: (link: string, id?: string) => JSX.Element;
    linkClick: LinkClickFn;
    direction: MatrixDirection;
}

export type Breadcrumbs = string[];

type MatrixDirection = "right-left" | "left-right";
type MatrixCell = {
    value: string;
    rowspan: number;
    rowNum: number;
    key: string;
};
type Matrix = MatrixCell[][];

function key(file: string, rowNum: number, colNum: number) {
    return `cell:${file}-${rowNum}-${colNum}`;
}

function prepareDataForMatrixView(
    direction: MatrixDirection,
    relations: Breadcrumbs[],
    file: string
): { rows: number; cols: number; transformed: Matrix } {
    const rows = relations.length;
    const cols = _.maxBy(relations, (path) => path.length)?.length || 0;

    let transformed: Matrix;

    const reverse = (l: Breadcrumbs) => l.slice().reverse();
    const makeRow = (row: Breadcrumbs, rowNum: number, padLeft: number) =>
        row.map((value, colNum) => ({
            value,
            rowspan: 1,
            rowNum,
            key: key(file, rowNum, padLeft + colNum),
        }));

    if (direction == "left-right")
        transformed = _.sortBy(relations).map((r, rNum) => makeRow(r, rNum, 0));
    else if (direction == "right-left")
        transformed = _.sortBy(relations, reverse).map((row, rowNum) =>
            _.concat(
                _.fill(new Array(cols - row.length), null),
                makeRow(row, rowNum, cols - row.length)
            )
        );

    _.times(cols, (col) =>
        _.times(rows, (row) => {
            const cell = transformed[row][col];
            const prevCell = row > 0 && transformed[row - 1][col];
            if (row > 0 && cell && prevCell && cell.value === prevCell.value) {
                transformed[row][col] = prevCell;
                prevCell.rowspan++;
            }
        })
    );

    return { rows, cols, transformed };
}

export function SimplePath({ relations }: BreadcrumbsProps) {
    return (
        <div>
            {relations.map((path, i) => (
                <div key={i}> {path.join(" -> ")}</div>
            ))}
        </div>
    );
}

function computeTableColumnWidths(
    rows: number,
    cols: number,
    transformed: Matrix
) {
    const columnLengths = _.times(cols, (col) =>
        _.max(_.times(rows, (row) => transformed[row][col]?.value?.length))
    );
    const totalWidth = _.sum(columnLengths);
    return _.map(columnLengths, (length) =>
        Math.round((100 * length) / totalWidth)
    );
}

export function Matrix({
    file,
    relations,
    drawLink,
    linkClick,
    direction = "right-left",
}: BreadcrumbsProps) {
    const { rows, cols, transformed } = prepareDataForMatrixView(
        direction,
        relations,
        file
    );
    const allConnectedPairs = _.uniqWith(
        _.flatMap(transformed, (row) =>
            _.map(row, (cell, cellNum) => ({
                from: cell?.key,
                to: row[cellNum - 1]?.key,
            }))
        ).filter((link) => link.from && link.to),
        _.isEqual
    );
    const columnWidths = computeTableColumnWidths(rows, cols, transformed);

    return (
        <div className="embedded-backlinks simple-hierarchy-matrix">
            <table className="backlink-pane">
                <tbody>
                    {_.times(rows, (row) => (
                        <tr key={`row:${row}`}>
                            {_.times(cols, (col) => {
                                const cell = transformed[row][col];
                                if (!cell)
                                    return (
                                        <td
                                            key={key(file + ":empty", row, col)}
                                        ></td>
                                    );
                                if (cell.rowNum == row)
                                    return (
                                        <td
                                            rowSpan={cell.rowspan}
                                            key={cell.key}
                                            style={{
                                                width: columnWidths[col] + "%",
                                            }}
                                        >
                                            {drawLink(cell.value, cell.key)}
                                        </td>
                                    );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            {_.map(allConnectedPairs, ({ from, to }) => (
                <Xarrow
                    key={from + "/" + to}
                    start={from}
                    end={to}
                    showTail={false}
                    showHead={false}
                    startAnchor={"middle"}
                    endAnchor={"middle"}
                    path={"grid"}
                    strokeWidth={1}
                    gridBreak={"20%"}
                    zIndex={0}
                />
            ))}
        </div>
    );
}

export interface Suggestion {
    moc: string;
    connected: string[];
    score: number;
    type: SuggestionType;
}

export type SuggestionType = "direct" | "through";

interface SuggestionProps {
    suggestions: Suggestion[];
    drawLink: (link: string) => JSX.Element;
    linkClick: LinkClickFn;
}

export function Suggestions({
    drawLink,
    linkClick,
    suggestions,
}: SuggestionProps) {
    return (
        <div className="embedded-backlinks simple-hierarchy-matrix">
            <div className="backlink-pane">
                <div className="tree-item search-result">
                    <div className="tree-item-self search-result-file-title is-clickable">
                        Possible connections
                    </div>
                    <div className="search-result-file-matches">
                        {suggestions.map(({ moc, connected, type }) => (
                            <div
                                key={"suggestion-list" + moc}
                                className="search-result-file-match"
                                {...linkClick(moc)}
                            >
                                {drawLink(moc)}
                                <span className="suggestion-why">
                                    {type}:
                                    {connected.map((link, i) => (
                                        <span
                                            key={"suggestion-link-key" + link}
                                        >
                                            {drawLink(link)}
                                            {i < connected.length - 1 && ","}
                                        </span>
                                    ))}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
