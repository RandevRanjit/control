/** Files a person reads rather than runs: documents, pictures, media and builds. */
const ARTEFACT_EXTENSION =
  /\.(md|markdown|mdx|txt|pdf|rtf|docx?|odt|pptx?|key|xlsx?|numbers|pages|csv|tsv|png|jpe?g|gif|webp|avif|heic|svg|ico|mp4|mov|webm|m4v|mp3|wav|m4a|aiff?|flac|dmg|zip|pkg|ipa|apk|aab|tar|gz|tgz|whl|msi|exe)$/i;

export const isArtefactPath = (path: string) => ARTEFACT_EXTENSION.test(path);
