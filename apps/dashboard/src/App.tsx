import { createBrowserRouter, RouterProvider } from "react-router";

import { TooltipProvider } from "@/components/ui/tooltip";

import { appRoutes } from "./app-routes";

const router = createBrowserRouter(appRoutes);

function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}

export default App;
