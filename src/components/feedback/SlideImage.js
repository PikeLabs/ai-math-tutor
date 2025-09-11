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
			crossOrigin="anonymous"
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
