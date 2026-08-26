"use client";

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  pageSizes?: number[];
  onChange: (page: number, pageSize: number) => void;
  /** 标签前缀，如 '窗口' / '反转' */
  itemLabel?: string;
}

export default function Pagination({
  page,
  total,
  pageSize,
  pageSizes = [6, 12, 24, 48],
  onChange,
  itemLabel = "窗口",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return (
      <div className="text-center text-[11px] text-zinc-500">
        共 {total.toLocaleString()} 个{itemLabel}
      </div>
    );
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(page - 1, pageSize)}
          disabled={page <= 1}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 text-[12px] text-zinc-300 hover:border-brand-500 hover:text-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          上一页
        </button>
        <span className="text-[12px] text-zinc-400">
          第 <span className="font-semibold text-zinc-100">{page}</span> / {totalPages} 页 ·{" "}
          {start.toLocaleString()}-{end.toLocaleString()} 共{" "}
          <span className="font-semibold text-zinc-100">{total.toLocaleString()}</span> 个
        </span>
        <button
          onClick={() => onChange(page + 1, pageSize)}
          disabled={page >= totalPages}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 text-[12px] text-zinc-300 hover:border-brand-500 hover:text-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一页
        </button>
      </div>
      <div className="flex items-center gap-2 text-[12px] text-zinc-400">
        <span>每页</span>
        <select
          value={pageSize}
          onChange={(e) => onChange(1, parseInt(e.target.value, 10))}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200 outline-none focus:border-brand-500"
        >
          {pageSizes.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
