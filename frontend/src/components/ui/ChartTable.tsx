/** A visually hidden data table that sits next to a chart, so people using a screen reader get
 * the same numbers the chart shows (a chart drawn as SVG is otherwise just a picture to them). */
import type { ReactNode } from "react";

type ChartTableProps = {
  caption: string;
  columns: string[];
  rows: ReactNode[][];
};

export default function ChartTable({ caption, columns, rows }: ChartTableProps) {
  return (
    <div className="sr-only">
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
