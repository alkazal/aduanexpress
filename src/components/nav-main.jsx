import { ChevronRight } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

import {
  FileText,
  PlusCircle,
} from "lucide-react"

import { Button } from "../components/ui/button";

export function NavMain({ items }) {
  const { pathname } = useLocation()

  return (
      <SidebarGroup>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              asChild
              tooltip="Quick Create"
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <Link to="/new-report">
                <PlusCircle />
                <span>Quick Create</span>
              </Link>
            </SidebarMenuButton>
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
            >
              <FileText />
              <span className="sr-only">Inbox</span>
            </Button>
          </SidebarMenuItem>
      {/* <SidebarGroupLabel>Navigation</SidebarGroupLabel> */}
      <SidebarMenu>
        {items.map((item) => {
          const isActive = item.url === "/"
            ? pathname === "/"
            : pathname.startsWith(item.url)

          // Direct link (no sub-items)
          if (!item.items || item.items.length === 0) {
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
                  <Link to={item.url}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }

          // Collapsible group with sub-items
          return (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={item.isActive || isActive}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title} isActive={isActive}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton asChild isActive={pathname === subItem.url}>
                          <Link to={subItem.url}>
                            <span>{subItem.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
