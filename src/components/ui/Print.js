import { forwardRef } from "react";

const PrintableComponent = forwardRef(({ children }, ref) => {
    console.log("Ref", ref)
    return (
        <div ref={ref}>
            {children}
        </div>
    );
});

export default PrintableComponent