import * as React from "react";
import _ from "lodash";

interface BreadcrumbsProps {
    file: string;
    relations: Breadcrumbs[];
}

export type Breadcrumbs = string[];

export function SimplePath({ relations }: BreadcrumbsProps) {
    return (
        <div>
            {relations.map((path, i) => (
                <div key={i}> {path.join(" -> ")}</div>
            ))}
        </div>
    );
}

export function Matrix({ relations }: BreadcrumbsProps) {
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
                                        {cell.value}
                                    </td>
                                );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
