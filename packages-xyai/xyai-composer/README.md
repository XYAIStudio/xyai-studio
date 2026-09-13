---
description: "XYAI capability menu, reviewed voice input, Harness status, queue notice, and durable quick phrases added to the resident DSH composer."
kind: "package-reference"
---

# @xyai/dsh-composer

English | [中文](README.zh.md)

## Summary

This package adds compact XYAI controls to the resident DSH composer. It does not replace DSH input behavior. The capability menu searches local actions and phrases, opens the existing slash skill and command pipeline by inserting `/`, opens Plan mode by inserting `/plan`, inserts Host-persisted quick phrases, and explains why files, Knowledge, or session plugin selection is unavailable when XYAI does not own that provider. Voice input uses browser speech recognition when supported, keeps recognition in a review field with a timer, silent, and denied outcomes, and changes the DSH draft only after the user selects **Insert into draft**. The dock reports DSH as the active Harness, lists other adapters as unavailable, and derives character, attachment, queue, and busy counts from live input state. An overlay notice appears only while the input is busy or the queue is non-empty.

DSH continues to own model and reasoning selection, Plan mode execution, permission presets, attachments, context metering, sending, stopping, and queued messages. This package composes beside those controls through public slots and input actions.

## Settings

The Host registers the validated `xyai-composer` settings namespace. A user may store up to 50 quick phrases; names are 1–40 characters and phrase content is 1–2000 characters. The settings view can add, edit, or delete a phrase, rejects a duplicate name or a 51st phrase before the Host write, retains the edited fields when Host persistence fails, and reports the failure instead of showing a false success.

## Availability

The Knowledge action opens the public `xyai:open-knowledge` event exposed by the mounted Knowledge plugin. Session-level plugin selection remains disabled until a real DSH provider registers that capability. DSH is the only selectable Harness in this package. Additional Harness choices require an adapter that owns execution, state restoration, permission mapping, and failure reporting. Browser speech recognition availability depends on the packaged Chromium runtime; unsupported runtimes show an unavailable message and leave text entry usable.

## Acceptance and tutorial traceability

Each row ties the prototype flow to observable product behavior. A tutorial scene is complete only when the listed state change or unavailable result is visible. The CMP-to-XC lookup map is [prototypes/composer/STATUS.md](../../prototypes/composer/STATUS.md).

| ID | Control and steps | Preconditions | Observable state and failure | Persistence | Owner and DSH interface | Acceptance / tutorial scene |
|---|---|---|---|---|---|---|
| XC-01 | Open **Capabilities**, select **Skills and commands**, then choose a slash result. | Input phase is plain; `ui-skill` or a command provider is mounted. | Draft becomes `/` and DSH opens its real suggestion flow; busy input disables the action. | Draft/session rules are DSH-owned. | `@xyai/dsh-composer`; `conversation.input.left`, `inputActions.setDraft`. | Component test asserts `/`; record menu → suggestion → selection. |
| XC-02 | Open **Capabilities** and select **Knowledge**. | `@xyai/dsh-knowledge` is composed. | The composer dispatches `xyai:open-knowledge`; the Knowledge plugin opens its real overlay and presents mounted sources. | Knowledge plugin registry and artifacts. | `@xyai/dsh-composer` → public `xyai:open-knowledge` event → `@xyai/dsh-knowledge`. | Component test asserts the event; record menu → Knowledge Base → mounted source. |
| XC-03 | Open **Capabilities** and inspect **Plugin tools**. | No session plugin-selection provider is mounted. | Button is disabled and explains the missing provider. | None. | `@xyai/dsh-composer`; capability availability presentation. | Inspect disabled state and reason; enable only with a real provider test. |
| XC-04 | Add a phrase in Settings, open **Capabilities**, then select that phrase. | Host `settingsScope` is writable. | Successful Host mutation makes the phrase available; selecting it appends to the draft. A failed mutation shows an alert and retains both edited fields. | Host `xyai-composer` namespace; at most 50 phrases. | Host schema + `settingsScope.mutate` + `inputActions.setDraft`. | Component tests cover insertion and write failure; record add → reopen → insert. |
| XC-05 | Open voice input, start, stop, edit the transcript, then select **Insert into draft**. | Packaged Chromium exposes `SpeechRecognition` or `webkitSpeechRecognition`; input is plain. | Recording, timer, and interim text are visible. Draft stays unchanged until insertion. Recognition failure shows an alert; unsupported runtime shows a status message. | Transcript is local component state until inserted; inserted text follows DSH draft rules. | `conversation.input.right`; Web Speech API + `inputActions.setDraft`. | Component test proves review before insertion; desktop tutorial must also record unsupported behavior when applicable. |
| XC-06 | Open **Harness: DSH**. | XYAI profile runs on DSH. | DSH shows connected; Codex and Claude Code are disabled with an unavailable reason. | Session execution ownership remains with DSH. | `conversation.composer.dock`. | Component test asserts status; enable switching only after adapter execution and restore tests exist. |
| XC-07 | Type text, attach a file, or queue a message. | Corresponding DSH input state exists. | Character, attachment, queue, and busy counts update from the live snapshot. | DSH session/draft ownership. | `useInput` on the dock slot. | Component test asserts all four facts. |
| XC-08 | Open **Capabilities** and select **Plan mode**. | Input phase is plain; DSH plan plugin is mounted. | Draft becomes `/plan` and DSH opens its real plan command flow. | Draft/session rules are DSH-owned. | `conversation.input.left`, `inputActions.setDraft`. | Component test asserts `/plan`; record menu → `/plan`. |
| XC-09 | Open voice input, stop without speech, then deny the microphone. | Speech recognition constructor is present. | Empty stop shows a silent status; `not-allowed` shows a denied alert. Draft stays unchanged. | None until insert. | `conversation.input.right`. | Component test asserts both outcomes and no `setDraft`. |
| XC-10 | Edit an existing phrase, then try to add a duplicate name. | Host `settingsScope` is writable. | Edit saves through Host mutation. A duplicate name shows an alert and does not write. | Host `xyai-composer` namespace. | Settings section + `validateSnippet`. | Component tests cover edit success and duplicate rejection. |
| XC-11 | Open **Capabilities** and filter the search field. | Menu is open. | Matching rows stay; a miss shows the empty-search status. Escape closes the menu without changing the draft. | None. | Capability menu search. | Component tests cover filter, empty, and Escape. |
| XC-12 | Queue a message while the input is idle. | Live queue length is 1. | Overlay reports the queued count and does not offer a fake send or steer action. | DSH queue ownership. | `conversation.input.overlay`. | Component test asserts the status and the absent send control. |
| DSH-01 | Select model and reasoning effort in the resident selectors. | Model/provider capabilities are loaded. | DSH displays accepted selection or its native error; available effort levels come from Host capability data. | DSH session/settings ownership. | `ui-model-selection`. | Use upstream focused tests and desktop scene; XYAI does not duplicate these controls. |
| DSH-02 | Toggle native mode and Plan mode, including `/plan` and `/plan off`. | DSH mode and plan plugins are mounted. | Mode state changes in the resident composer and session log. | DSH session state. | `ui-plan` and the resident mode control. | Use upstream behavior tests and record the active mode indicator. |
| DSH-03 | Change the permission preset before submitting. | `ui-permission-presets` is mounted. | Active preset changes; approval behavior follows the selected policy. | DSH settings/session state. | `ui-permission-presets`. | Use upstream permission tests and record one approval-required action. |
| DSH-04 | Add or remove attachments with the resident attachment control. | `ui-attachment` and file upload services are mounted. | Attachment chips show upload/removal state; XC-07 count follows accepted IDs. | DSH attachment/session storage. | `ui-attachment`. | Use upstream upload failure/success tests and desktop tutorial. |
| DSH-05 | Inspect the resident context meter while composing. | Token meter/context services are mounted. | Meter reflects DSH context data and its native unavailable/error state. | DSH session projection. | Resident context meter. | Use upstream context tests and record a state change; XC-07 is not a token estimate. |
| DSH-06 | Send, stop, and queue messages with resident controls. | Active DSH session. | Submission enters the agent loop; stop ends the active run; queue count and contents change through DSH actions. | DSH session log and queue. | Resident input actions. | Use upstream session/queue tests and a desktop run recording. |

## Model Experience

The package adds no model-visible context or tools. Inserted text becomes model-visible only through the resident DSH draft and submission path.

#### KV Cache effect

None beyond the user-authored text eventually submitted through DSH.

## Runtime ownership

- `conversation.input.left`: capability menu, Plan slash, and quick phrases.
- `conversation.input.right`: reviewed voice input.
- `conversation.composer.dock`: Harness catalog and live input statistics.
- `conversation.input.overlay`: busy or queued notice.
- `settings.section`: persistent quick-phrase manager.

## Known Limitations and Deferred Work

- Knowledge opens the mounted provider through `xyai:open-knowledge`. Session plugin selection, extra Harness adapters, and a file picker stay disabled until real providers register; the menu reports the missing provider instead of simulating success.
- Voice insert appends reviewed text to the DSH draft; the public input face has no caret-span write.
- Browser speech recognition depends on the packaged Chromium runtime.
- The package publishes no `./invariant`; slot lifecycle and settings validation remain owned by the DSH services that provide them.
