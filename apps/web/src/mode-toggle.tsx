import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { Button } from "@refhaven/ui/components/button";
import { Icon } from "@refhaven/ui/components/icon";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@refhaven/ui/components/menu";
import { useTheme } from "@/theme-provider";

export function ModeToggle() {
  const { setTheme } = useTheme();

  return (
    <Menu>
      <MenuTrigger render={<Button variant="secondary" size="icon" aria-label="Theme" />}>
        <Icon icon={Sun03Icon} size={18} className="dark:hidden" />
        <Icon icon={Moon02Icon} size={18} className="hidden dark:block" />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onClick={() => setTheme("light")}>Light</MenuItem>
        <MenuItem onClick={() => setTheme("dark")}>Dark</MenuItem>
        <MenuItem onClick={() => setTheme("system")}>System</MenuItem>
      </MenuContent>
    </Menu>
  );
}
