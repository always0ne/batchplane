import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from "react-router-dom";

import { ApprovalsPage } from "../pages/approvals/ApprovalsPage";
import { AuditPage } from "../pages/audit/AuditPage";
import { BatchDetailPage } from "../pages/batches/BatchDetailPage";
import { BatchListPage } from "../pages/batches/BatchListPage";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import { ExecutionDetailPage } from "../pages/executions/ExecutionDetailPage";
import { ExecutionListPage } from "../pages/executions/ExecutionListPage";
import { FailureListPage } from "../pages/executions/failures/FailureListPage";
import { MyWorkPage } from "../pages/my-work/MyWorkPage";
import { NotFoundPage } from "../pages/not-found/NotFoundPage";
import { BatchRegistrationPage } from "../pages/requests/changes/BatchRegistrationPage";
import { GovernedChangeDetailPage } from "../pages/requests/changes/GovernedChangeDetailPage";
import { ExecutionRequestDetailPage } from "../pages/requests/execution/ExecutionRequestDetailPage";
import { ExecutionRequestPage } from "../pages/requests/execution/ExecutionRequestPage";
import { RequestListPage } from "../pages/requests/RequestListPage";
import { WorkspacePage } from "../pages/workspace/WorkspacePage";
import { LiteGitHubConnectionEditor } from "../runtime/GitHubConnectionForm";
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
      { id: "batches", path: "batches", element: <BatchListPage /> },
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
        id: "execution-detail",
        path: "executions/:executionId",
        element: <ExecutionDetailPage />,
      },
      {
        id: "executions",
        path: "executions",
        element: <ExecutionListPage />,
      },
      {
        id: "failures",
        path: "executions/failures",
        element: <FailureListPage />,
      },
      {
        id: "requests",
        path: "requests",
        element: <RequestListPage />,
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
      {
        id: "workspace",
        path: "workspace",
        element: (
          <WorkspacePage connectionEditor={LiteGitHubConnectionEditor} />
        ),
      },
      { id: "not-found", path: "*", element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter(
  basename?: string,
): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(appRoutes, { basename });
}
