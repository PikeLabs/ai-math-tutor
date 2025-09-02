import { forwardRef } from "react";

const PrintWrapper = forwardRef(({ children }, ref) => {
	return <div ref={ref}>{children}</div>;
});

export default PrintWrapper;
