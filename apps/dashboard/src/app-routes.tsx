import type { RouteObject } from "react-router";

import { AppLayout } from "@/features/projects/components/app-layout";
import { ProjectDetailPage } from "@/features/projects/components/project-detail-page";
import { ProjectsIndexRoute } from "@/features/projects/components/projects-index-route";
import { WorktreeDetailPage } from "@/features/worktrees/components/worktree-detail-page";

export const appRoutes: RouteObject[] = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <ProjectsIndexRoute /> },
      { path: "projects/:projectId", element: <ProjectDetailPage /> },
      {
        path: "projects/:projectId/worktrees/:worktreeId",
        element: <WorktreeDetailPage />,
      },
    ],
  },
];
