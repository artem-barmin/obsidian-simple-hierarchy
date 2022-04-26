import * as React from "react";

interface BreadcrumbsProps {
    file: string;
    relations: Breadcrumbs[];
}

export type Breadcrumbs = string[];

export function SimplePath({ relations }: BreadcrumbsProps) {
    return (
        <div>
            {relations.map((path) => (
                <div> {path.join(" -> ")}</div>
            ))}
        </div>
    );
}
