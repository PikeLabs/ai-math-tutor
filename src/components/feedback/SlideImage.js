export default function SlideImage({
	src,
	alt = "",
	className = "",
	style = {},
	onClick,
	onLoad,
	onError,
}) {
	return (
		<img
			src={src}
			alt={alt}
			crossOrigin="anonymous" // <-- important for html2canvas
			className={className}
			style={style}
			onClick={onClick}
			onLoad={onLoad}
			onError={onError}
			loading="lazy"
			decoding="async"
		/>
	);
}
