import { IMAGE_BASE } from "../constants";

// helper to resolve absolute or relative URL
export function resolveUrl(pathOrUrl) {
	if (!pathOrUrl) return null;
	const isAbs = /^https?:\/\//i.test(pathOrUrl);
	return isAbs ? pathOrUrl : `${IMAGE_BASE}${pathOrUrl}`;
}
