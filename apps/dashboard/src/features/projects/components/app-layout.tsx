import { Outlet } from "react-router";

import { ProjectsSidebar } from "./projects-sidebar";

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col lg:flex-row">
      <ProjectsSidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
