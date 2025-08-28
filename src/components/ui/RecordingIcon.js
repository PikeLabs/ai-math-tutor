const recordingSVG = (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
	>
		<path
			d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4Z"
			fill="#A9A9A9"
		/>
		<path
			d="M12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6Z"
			fill="red"
		/>
	</svg>
);

export function RecordingIcon() {
	return (
		<span className="text-md font-medium text-red-600">
			{recordingSVG}
		</span>
	);
}

const pausedSVG = (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
	>
		<path
			d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM10 9C10.5523 9 11 9.44772 11 10V14C11 14.5523 10.5523 15 10 15C9.44772 15 9 14.5523 9 14V10C9 9.44772 9.44772 9 10 9ZM14 9C14.5523 9 15 9.44772 15 10V14C15 14.5523 14.5523 15 14 15C13.4477 15 13 14.5523 13 14V10C13 9.44772 13.4477 9 14 9Z"
			fill="#9CA3AF"
		/>
	</svg>
);

export function PausedIcon() {
	return (
		<span className="text-md font-medium text-gray-400">
			{pausedSVG}
		</span>
	);
}
