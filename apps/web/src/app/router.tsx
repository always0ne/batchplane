import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from "react-router-dom";

import { ApprovalsPage } from "../features/approvals/ApprovalsPage";
import { AuditPage } from "../features/audit/AuditPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ExecutionRequestDetailPage } from "../features/execution-requests/ExecutionRequestDetailPage";
import { ExecutionRequestPage } from "../features/execution-requests/ExecutionRequestPage";
import { ExecutionRunDetailPage } from "../features/execution-requests/ExecutionRunDetailPage";
import { ExecutionRunListPage } from "../features/execution-requests/ExecutionRunListPage";
import { LiteSetupPage } from "../features/lite-setup/LiteSetupPage";
import { MyWorkPage } from "../features/my-work/MyWorkPage";
import { WorkspaceRequestsPage } from "../features/requests/WorkspaceRequestsPage";
import { BatchDetailPage } from "../pages/batches/BatchDetailPage";
import { BatchRegistrationPage } from "../pages/batches/BatchRegistrationPage";
import { BatchesPage } from "../pages/batches/BatchesPage";
import { NotFoundPage } from "../pages/not-found/NotFoundPage";
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
        path: "execution-requests/:issueNumber",
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
