import * as React from "react";
import _ from "lodash";

interface BreadcrumbsProps {
    file: string;
    relations: Breadcrumbs[];
    drawLink: (link: string) => JSX.Element;
}

export type Breadcrumbs = string[];

function prepareDataForMatrixView(relations: Breadcrumbs[]) {
    const rows = relations.length;
    const cols = _.maxBy(relations, (path) => path.length)?.length || 0;

    const transformed = relations.map((row, rowNum) =>
        row.map((value) => ({ value, rowspan: 1, rowNum }))
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

export function Matrix({ relations, drawLink }: BreadcrumbsProps) {
    const { rows, cols, transformed } = prepareDataForMatrixView(relations);
    const style = {
        border: "1px solid black",
        borderCollapse: "collapse",
    };

    return (
        <table style={{ ...style, width: "100%" }}>
            <tbody>
                {_.times(rows, (row) => (
                    <tr key={`row:${row}`}>
                        {_.times(cols, (col) => {
                            const cell = transformed[row][col];
                            if (!cell) return null;
                            if (cell.rowNum == row)
                                return (
                                    <td
                                        style={style}
                                        rowSpan={cell.rowspan}
                                        key={`cell:${row}:${col}`}
                                    >
                                        {drawLink(cell.value)}
                                    </td>
                                );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
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
            {suggestions.map(({ moc, connected, score, type }) => (
                <div>
                    {drawLink(moc)}
                    <span className="suggestion-why">
                        {type}:{connected.join(",")}
                    </span>
                    <button className="suggestion-connect">Connect</button>
                </div>
            ))}
        </div>
    );
}
