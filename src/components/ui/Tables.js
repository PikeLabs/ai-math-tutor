export const ColumnHeader = ({ title }) => (
	<div className="mb-2 font-medium text-gray-700">{title}</div>
);

export const TableHeader = ({ title }) => (
	<th className="px-4 py-3 text-center font-semibold text-slate-600 w-[220px]">
		{title}
	</th>
);
