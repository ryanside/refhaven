import { Tick02Icon } from "@hugeicons/core-free-icons";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "cn";
import { Icon } from "./icon";

/** A floating surface that scales in from its trigger. Menus and popovers share it. */
const popupClass =
  "origin-(--transform-origin) rounded-[18px] bg-surface text-ink shadow-float-lg outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

const itemClass =
  "flex h-9 cursor-default items-center gap-2.5 rounded-[11px] px-2.5 text-[14px] font-[480] text-ink outline-none select-none data-disabled:opacity-40 data-highlighted:bg-hover [&_svg]:shrink-0 [&_svg]:text-ink-2";

const Menu = MenuPrimitive.Root;
const MenuTrigger = MenuPrimitive.Trigger;
const MenuGroup = MenuPrimitive.Group;
const MenuRadioGroup = MenuPrimitive.RadioGroup;
const MenuSubmenu = MenuPrimitive.SubmenuRoot;

function MenuContent({
  className,
  align = "start",
  side = "bottom",
  sideOffset = 8,
  alignOffset = 0,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "align" | "side" | "sideOffset" | "alignOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="z-50 outline-none"
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
      >
        <MenuPrimitive.Popup
          className={cn(
            popupClass,
            "max-h-(--available-height) min-w-52 overflow-y-auto p-1.5",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return <MenuPrimitive.Item className={cn(itemClass, className)} {...props} />;
}

function MenuLinkItem({ className, ...props }: MenuPrimitive.LinkItem.Props) {
  return <MenuPrimitive.LinkItem className={cn(itemClass, className)} {...props} />;
}

function MenuSubmenuTrigger({ className, ...props }: MenuPrimitive.SubmenuTrigger.Props) {
  return (
    <MenuPrimitive.SubmenuTrigger
      className={cn(itemClass, "data-popup-open:bg-hover", className)}
      {...props}
    />
  );
}

/** A choice of one. The chosen item carries a tick at its end. */
function MenuRadioItem({
  className,
  children,
  closeOnClick = true,
  ...props
}: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      className={cn(itemClass, "pr-2", className)}
      closeOnClick={closeOnClick}
      {...props}
    >
      {children}
      <MenuPrimitive.RadioItemIndicator className="ml-auto flex">
        <Icon icon={Tick02Icon} size={16} className="text-ink!" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

function MenuCheckboxItem({ className, children, ...props }: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem className={cn(itemClass, "pr-2", className)} {...props}>
      {children}
      <MenuPrimitive.CheckboxItemIndicator className="ml-auto flex">
        <Icon icon={Tick02Icon} size={16} className="text-ink!" />
      </MenuPrimitive.CheckboxItemIndicator>
    </MenuPrimitive.CheckboxItem>
  );
}

function MenuLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      className={cn("px-2.5 pt-2 pb-1.5 text-[12px] leading-4 font-[520] text-ink-3", className)}
      {...props}
    />
  );
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return <MenuPrimitive.Separator className={cn("mx-1 my-1.5 h-px bg-line", className)} {...props} />;
}

export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuLinkItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSubmenu,
  MenuSubmenuTrigger,
  MenuTrigger,
  itemClass,
  popupClass,
};
