import React, { JSX, useContext } from "react";
import { Link } from "react-router-dom";
import { AppContext } from "../app-context.jsx";
import { FireproofHome } from "./FireproofHome.jsx";
import { TenantSelector } from "./TenantSelector.jsx";
//

export function Sidebar({ sideBarComponent, title, newUrl }: { sideBarComponent: JSX.Element; title?: string; newUrl?: string }) {
  const { isSidebarOpen, setIsSidebarOpen } = useContext(AppContext).sideBar;
  return (
    <div
      className={`fixed md:static inset-0 bg-fp-bg-00 z-40 w-[280px] transform transition-transform duration-300 ease-in-out ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      } md:translate-x-0 flex flex-col border-r border-fp-dec-00 overflow-hidden`}
    >
      <div className="flex h-[60px] items-center px-5 flex-shrink-0 justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <FireproofHome />
          <Link to="" onClick={() => setIsSidebarOpen?.(false)}>
            <span>Fireproof Connect</span>
          </Link>
        </div>
        {/* Close button for mobile */}
        <button onClick={() => setIsSidebarOpen?.(false)} className="md:hidden p-2 rounded-md bg-[--muted] hover:bg-[--muted]/80">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <TenantSelector />
      <div className="flex-1 overflow-y-auto">
        <nav className="grid gap-4 px-6 py-4 text-sm font-medium">
          {title && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{title}</span>
              </div>
              {newUrl && (
                <Link
                  className="inline-flex h-8 items-center justify-center rounded bg-[--accent] px-3 text-accent-foreground transition-colors hover:bg-[--accent]/80"
                  to={newUrl}
                  onClick={() => setIsSidebarOpen?.(false)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d="M5 12h14"></path>
                    <path d="M12 5v14"></path>
                  </svg>
                </Link>
              )}
            </div>
          )}
          <div className="grid gap-2">{sideBarComponent}</div>
        </nav>
      </div>
    </div>
  );
}
