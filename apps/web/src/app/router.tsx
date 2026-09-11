import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from "react-router-dom";

import { AuditPage } from "../features/audit/AuditPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ExecutionRunDetailPage } from "../features/execution-requests/ExecutionRunDetailPage";
import { ExecutionRunListPage } from "../features/execution-requests/ExecutionRunListPage";
import { LiteSetupPage } from "../features/lite-setup/LiteSetupPage";
import { BatchDetailPage } from "../pages/batches/BatchDetailPage";
import { BatchRegistrationPage } from "../pages/batches/BatchRegistrationPage";
import { BatchesPage } from "../pages/batches/BatchesPage";
import { ApprovalsPage } from "../pages/approvals/ApprovalsPage";
import { ExecutionRequestDetailPage } from "../pages/execution-requests/ExecutionRequestDetailPage";
import { ExecutionRequestPage } from "../pages/execution-requests/ExecutionRequestPage";
import { MyWorkPage } from "../pages/my-work/MyWorkPage";
import { NotFoundPage } from "../pages/not-found/NotFoundPage";
import { WorkspaceRequestsPage } from "../pages/requests/WorkspaceRequestsPage";
import { GovernedChangeDetailPage } from "../pages/approvals/GovernedChangeDetailPage";
import { RootLayout } from "./RootLayout";
import { ScheduleChangeRedirect } from "./ScheduleChangeRedirect";

export const appRoutes: RouteObject[] = [
  {
    id: "root",
    path: "/",
    element: <RootLayout />,
    children: [
      {
        id: "index",
        index: true,
        element: <Navigate replace to="/dashboard" />,
      },
      { id: "dashboard", path: "dashboard", element: <DashboardPage /> },
      { id: "my-work", path: "my-work", element: <MyWorkPage /> },
      { id: "batches", path: "batches", element: <BatchesPage /> },
      {
        id: "batch-registration",
        path: "batches/new",
        element: <BatchRegistrationPage />,
      },
      {
        id: "legacy-schedule",
        path: "batches/:batchId/schedules/new",
        element: <ScheduleChangeRedirect />,
      },
      {
        id: "batch-detail",
        path: "batches/:batchId",
        element: <BatchDetailPage />,
      },
      {
        id: "execution-request-create",
        path: "batches/:batchId/execution-requests/new",
        element: <ExecutionRequestPage />,
      },
      {
        id: "execution-request-detail",
        path: "execution-requests/:requestLocator",
        element: <ExecutionRequestDetailPage />,
      },
      {
        id: "execution-run-detail",
        path: "execution-runs/:runId",
        element: <ExecutionRunDetailPage />,
      },
      {
        id: "runs",
        path: "runs",
        element: <ExecutionRunListPage />,
      },
      {
        id: "failures",
        path: "failures",
        element: <ExecutionRunListPage view="failures" />,
      },
      {
        id: "requests",
        path: "requests",
        element: <WorkspaceRequestsPage />,
      },
      {
        id: "approvals",
        path: "approvals",
        element: <ApprovalsPage />,
      },
      {
        id: "governed-change-detail",
        path: "approvals/registration/:requestLocator",
        element: <GovernedChangeDetailPage />,
      },
      { id: "audit", path: "audit", element: <AuditPage /> },
      { id: "lite-setup", path: "lite/setup", element: <LiteSetupPage /> },
      { id: "not-found", path: "*", element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter(
  basename?: string,
): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(appRoutes, { basename });
}
