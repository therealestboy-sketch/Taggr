import React, { useEffect, useState } from "react";
import { avatarGradient, avatarInitials, resolveMediaRef } from "../utils";

type AvatarProps = {
    name: string;
    avatarRef?: string | null;
    size?: "sm" | "md" | "lg" | "xl";
    rounded?: "full" | "2xl";
    className?: string;
    onClick?: () => void;
    title?: string;
};

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
    sm: "w-8 h-8 text-xs",
    md: "w-9 h-9 text-xs",
    lg: "w-10 h-10 text-xs",
    xl: "w-20 h-20 text-2xl",
};

export const Avatar: React.FC<AvatarProps> = ({
    name,
    avatarRef,
    size = "lg",
    rounded = "full",
    className = "",
    onClick,
    title,
}) => {
    const src = resolveMediaRef(avatarRef);
    const [imgFailed, setImgFailed] = useState(false);

    useEffect(() => {
        setImgFailed(false);
    }, [src]);

    const shape = rounded === "2xl" ? "rounded-2xl" : "rounded-full";
    const sizeCls = SIZE_CLASSES[size];
    const interactive = onClick ? "cursor-pointer" : "";

    const content =
        src && !imgFailed ? (
            <img
                src={src}
                alt={name}
                loading="lazy"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
            />
        ) : (
            <span>{avatarInitials(name)}</span>
        );

    const commonClasses = `${sizeCls} ${shape} shrink-0 overflow-hidden flex items-center justify-center font-bold text-white select-none ${interactive} ${className}`;
    const style =
        src && !imgFailed ? undefined : { background: avatarGradient(name) };

    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={commonClasses}
                style={style}
                title={title || `@${name}`}
            >
                {content}
            </button>
        );
    }

    return (
        <div className={commonClasses} style={style} title={title}>
            {content}
        </div>
    );
};
