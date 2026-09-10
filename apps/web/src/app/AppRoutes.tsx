import { Navigate, Route, Routes, useParams } from "react-router-dom";

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

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/my-work" element={<MyWorkPage />} />
      <Route path="/batches" element={<BatchesPage />} />
      <Route path="/batches/new" element={<BatchRegistrationPage />} />
      <Route
        path="/batches/:batchId/schedules/new"
        element={<ScheduleChangeRedirect />}
      />
      <Route path="/batches/:batchId" element={<BatchDetailPage />} />
      <Route
        path="/batches/:batchId/execution-requests/new"
        element={<ExecutionRequestPage />}
      />
      <Route
        path="/execution-requests/:issueNumber"
        element={<ExecutionRequestDetailPage />}
      />
      <Route
        path="/execution-runs/:runId"
        element={<ExecutionRunDetailPage />}
      />
      <Route path="/runs" element={<ExecutionRunListPage />} />
      <Route
        path="/failures"
        element={<ExecutionRunListPage view="failures" />}
      />
      <Route path="/requests" element={<WorkspaceRequestsPage />} />
      <Route path="/approvals" element={<ApprovalsPage />} />
      <Route
        path="/approvals/registration/:requestLocator"
        element={<GovernedChangeDetailPage />}
      />
      <Route path="/audit" element={<AuditPage />} />
      <Route path="/lite/setup" element={<LiteSetupPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function ScheduleChangeRedirect() {
  const { batchId = "" } = useParams();

  return (
    <Navigate
      replace
      to={`/batches/new?change=${encodeURIComponent(batchId)}#schedules`}
    />
  );
}
