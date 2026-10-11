import type { BatchParameterDefinition } from "@batchplane/domain";
import { useMemo, useRef, useState } from "react";
import type { ParameterDefinitionDraft } from "../batch-parameter-definitions";

export function useBatchParameterDefinitions(
  initialDefinitions: BatchParameterDefinition[],
  onChange: (
    previous: ParameterDefinitionDraft[],
    next: ParameterDefinitionDraft[],
  ) => void,
) {
  const [drafts, setDrafts] = useState<ParameterDefinitionDraft[]>(() =>
    initialDefinitions.map((definition, index) => ({
      key: `existing-${index}`,
      definition: { ...definition },
    })),
  );
  const sequence = useRef(0);
  const definitions = useMemo(
    () => drafts.map((draft) => draft.definition),
    [drafts],
  );

  function changeDrafts(next: ParameterDefinitionDraft[]) {
    onChange(drafts, next);
    setDrafts(next);
  }
  function add() {
    sequence.current += 1;
    changeDrafts([
      ...drafts,
      {
        key: `new-${sequence.current}`,
        definition: { name: "", required: false, sensitive: false },
      },
    ]);
  }
  function update(key: string, nextDefinition: BatchParameterDefinition) {
    changeDrafts(
      drafts.map((draft) => {
        if (draft.key !== key) return draft;
        const definition = { ...nextDefinition };
        if (
          draft.definition.sensitive !== definition.sensitive ||
          (draft.definition.name !== definition.name &&
            definition.defaultValue?.kind === "SAVED")
        ) {
          delete definition.defaultValue;
        }
        return { ...draft, definition };
      }),
    );
  }
  function remove(key: string) {
    changeDrafts(drafts.filter((draft) => draft.key !== key));
  }
  return {
    drafts,
    definitions,
    add,
    update,
    remove,
  };
}
