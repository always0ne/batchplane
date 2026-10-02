import { Link, type LinkProps } from "react-router-dom";
import {
  getButtonClassName,
  type ButtonSize,
  type ButtonVariant,
} from "./button-styles";

type ButtonLinkProps = LinkProps & {
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function ButtonLink({
  className,
  size = "default",
  variant = "secondary",
  ...linkProps
}: ButtonLinkProps) {
  return (
    <Link
      className={getButtonClassName({ className, size, variant })}
      {...linkProps}
    />
  );
}
