import { Navigate, useParams } from "react-router-dom";

export function ScheduleChangeRedirect() {
  const { batchId = "" } = useParams();

  return (
    <Navigate
      replace
      to={`/batches/new?change=${encodeURIComponent(batchId)}#schedules`}
    />
  );
}
