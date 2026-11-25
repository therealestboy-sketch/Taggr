import "react";

declare module "react" {
    interface FormHTMLAttributes<T> {
        toolname?: string;
        tooldescription?: string;
        /** Pass `""` in JSX so React renders the boolean attribute into the DOM. */
        toolautosubmit?: string;
    }

    interface InputHTMLAttributes<T> {
        toolparamdescription?: string;
    }

    interface TextareaHTMLAttributes<T> {
        toolparamdescription?: string;
    }

    interface SelectHTMLAttributes<T> {
        toolparamdescription?: string;
    }

    interface FieldsetHTMLAttributes<T> {
        toolparamdescription?: string;
    }
}
