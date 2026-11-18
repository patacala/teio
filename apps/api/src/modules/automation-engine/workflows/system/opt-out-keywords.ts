/**
 * Default words that mean "stop messaging me", used by the system "Opt-out
 * keywords" automation. Organizations edit the list in the builder.
 *
 * Equivalent to the regular expressions that used to be hard-coded in
 * ConversationManagementService.isOptOutMessage (see the parity test), and
 * accent-insensitive. A trailing * matches the start of a word.
 */
export const DEFAULT_OPT_OUT_KEYWORDS: string[] = [
  'stop',
  'unsubscribe',
  'cancelar',
  'parar',
  'desuscribir',
  'no quiero',
  'no deseo',
  'no necesito',
  'ya no',
  'no mas',
  'deja de escribir*',
  'deja de enviar*',
  'deja de mandar*',
  'no contacten*',
  'no me contacten*',
  'no escriban*',
  'no me escriban*',
  'no envien*',
  'no me envien*',
  'no manden*',
  'no me manden*',
];
