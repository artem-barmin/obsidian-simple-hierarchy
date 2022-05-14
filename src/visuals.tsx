import * as React from "react";
import _ from "lodash";
import { Textfit } from "react-textfit";

interface BreadcrumbsProps {
    file: string;
    relations: Breadcrumbs[];
    drawLink: (link: string, id?: string) => JSX.Element;
    direction: MatrixDirection;
}

export type Breadcrumbs = string[];

type MatrixDirection = "right-left" | "left-right";
type MatrixCell = { value: string; rowspan: number; rowNum: number };
type Matrix = MatrixCell[][];

function prepareDataForMatrixView(
    direction: MatrixDirection,
    relations: Breadcrumbs[]
): { rows: number; cols: number; transformed: Matrix } {
    const rows = relations.length;
    const cols = _.maxBy(relations, (path) => path.length)?.length || 0;

    let transformed: Matrix;

    if (direction == "left-right")
        transformed = relations.map((row, rowNum) =>
            row.map((value) => ({ value, rowspan: 1, rowNum }))
        );
    else if (direction == "right-left")
        transformed = relations.map((row, rowNum) =>
            _.concat(
                _.fill(new Array(cols - row.length), null),
                row.map((value) => ({ value, rowspan: 1, rowNum }))
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

export function Matrix({
    relations,
    drawLink,
    direction = "right-left",
}: BreadcrumbsProps) {
    const { rows, cols, transformed } = prepareDataForMatrixView(
        direction,
        relations
    );
    return (
        <div className="embedded-backlinks simple-hierarchy-matrix">
            <table className="backlink-pane">
                <tbody>
                    {_.times(rows, (row) => (
                        <tr key={`row:${row}`}>
                            {_.times(cols, (col) => {
                                const cell = transformed[row][col];
                                const key = `cell:${row}:${col}`;
                                if (!cell) return <td></td>;
                                if (cell.rowNum == row)
                                    return (
                                        <td rowSpan={cell.rowspan} key={key}>
                                            <div className="search-result-file-match">
                                                <Textfit
                                                    mode="single"
                                                    forceSingleModeWidth={false}
                                                >
                                                    {drawLink(cell.value)}
                                                </Textfit>
                                            </div>
                                        </td>
                                    );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

interface Suggestion {
    moc: string;
    connected: string[];
    score: number;
    type: "direct" | "through";
}

interface SuggestionProps {
    suggestions: Suggestion[];
    drawLink: (link: string) => JSX.Element;
}

export function Suggestions({ drawLink, suggestions }: SuggestionProps) {
    return (
        <div style={{ border: "1px solid black" }}>
            Possible connections:
            {suggestions.map(({ moc, connected, type }) => (
                <div key={"suggestion-list" + moc}>
                    {drawLink(moc)}
                    <span className="suggestion-why">
                        {type}:
                        {connected.map((link) => (
                            <span key={"suggestion-link-key" + link}>
                                {drawLink(link)},
                            </span>
                        ))}
                    </span>
                    <button className="suggestion-connect">Connect</button>
                </div>
            ))}
        </div>
    );
}
