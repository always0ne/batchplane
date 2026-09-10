import { useState } from "react";

import {
  readRuntimeFixtureSelection,
  type RuntimeFixtureId,
  writeRuntimeFixtureSelection,
} from "../runtime/runtime-fixtures";
import { AppRoutes } from "./AppRoutes";
import { AppShell } from "./AppShell";

export function App() {
  const [runtimeFixture, setRuntimeFixture] = useState(() =>
    readRuntimeFixtureSelection(),
  );

  function changeRuntimeFixture(fixtureId: RuntimeFixtureId) {
    writeRuntimeFixtureSelection(fixtureId);
    setRuntimeFixture(fixtureId);
  }

  return (
    <AppShell
      runtimeFixture={runtimeFixture}
      onRuntimeFixtureChange={changeRuntimeFixture}
    >
      <AppRoutes />
    </AppShell>
  );
}
