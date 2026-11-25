import React from "react";
import { BRAND } from "../brand";

export const BrandLogo: React.FC<{ size?: "sm" | "md" }> = ({
    size = "md",
}) => {
    const dim = size === "sm" ? "w-7 h-7 rounded-lg" : "w-8 h-8 rounded-xl";
    const svgDim = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
    return (
        <span className="inline-flex items-center gap-2.5 select-none">
            <span
                className={`${dim} ui-accent-bg flex items-center justify-center shadow-sm shrink-0`}
            >
                <svg
                    className={`${svgDim} text-white`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                >
                    <path d="M4 12a8 8 0 0 1 16 0" />
                    <path d="M8 12a4 4 0 0 1 8 0" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                    <path d="M12 13.5V20" />
                </svg>
            </span>
            <span className="font-bold text-lg tracking-tight ui-text">
                {BRAND.name}
            </span>
        </span>
    );
};
