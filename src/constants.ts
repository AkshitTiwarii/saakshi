export const EMOTIONS = [
  { id: 'numb', label: 'numb', emoji: '😶' },
  { id: 'anxious', label: 'anxious', emoji: '😟' },
  { id: 'overwhelmed', label: 'overwhelmed', emoji: '😢' },
  { id: 'angry', label: 'angry', emoji: '😡' },
];

export const CAPTURE_METHODS = [
  { id: 'speak', label: 'Speak', sublabel: 'Just use your voice', icon: 'mic', color: 'primary' },
  { id: 'write', label: 'Write', sublabel: 'Put words to screen', icon: 'keyboard', color: 'secondary' },
  { id: 'draw', label: 'Draw', sublabel: 'Map your thoughts', icon: 'edit', color: 'tertiary' },
  { id: 'upload', label: 'Upload', sublabel: 'Existing files', icon: 'upload', color: 'primary' },
];

export const SUPPORTED_LANGUAGES = [
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'ta-IN', label: 'Tamil' },
  { code: 'te-IN', label: 'Telugu' },
  { code: 'bn-IN', label: 'Bengali' },
  { code: 'mr-IN', label: 'Marathi' },
  { code: 'kn-IN', label: 'Kannada' },
  { code: 'ml-IN', label: 'Malayalam' },
  { code: 'gu-IN', label: 'Gujarati' },
  { code: 'pa-IN', label: 'Punjabi' },
  { code: 'or-IN', label: 'Odia' },
  { code: 'as-IN', label: 'Assamese' },
  { code: 'ur-IN', label: 'Urdu' },
  { code: 'sa-IN', label: 'Sanskrit' },
  { code: 'mai-IN', label: 'Maithili' },
  { code: 'kok-IN', label: 'Konkani' },
  { code: 'doi-IN', label: 'Dogri' },
  { code: 'ks-IN', label: 'Kashmiri' },
  { code: 'sd-IN', label: 'Sindhi' },
  { code: 'ne-IN', label: 'Nepali' },
  { code: 'mni-IN', label: 'Manipuri' },
  { code: 'bodo-IN', label: 'Bodo' },
];

export const LEGAL_DOCUMENT_TEMPLATES = [
  {
    id: 'fir',
    title: 'FIR Draft',
    type: 'LEGAL',
    description: 'Pre-filled first information report draft mapped to relevant criminal sections.',
  },
  {
    id: 'statement-183',
    title: 'Section 183 Statement Draft',
    type: 'LEGAL',
    description: 'Magistrate statement draft based on locked fragments and timeline reconstruction.',
  },
  {
    id: 'evidence-preservation',
    title: 'Evidence Preservation Application',
    type: 'EVIDENCE',
    description: 'Urgent notice template for CCTV, telecom, and digital records preservation.',
  },
  {
    id: 'dlsa-aid',
    title: 'DLSA Legal Aid Application',
    type: 'LEGAL',
    description: 'District Legal Services Authority request packet with survivor-safe metadata.',
  },
  {
    id: 'nalsa-compensation',
    title: 'NALSA Compensation Application',
    type: 'RELIEF',
    description: 'Victim compensation request form with supporting chronology and document checklist.',
  },
  {
    id: 'protection-order',
    title: 'Protection Order Application',
    type: 'PROTECTION',
    description: 'Threat and intimidation response filing with contact-safe service instructions.',
  },
  {
    id: 'pocso-filing',
    title: 'POCSO Filing Packet (Minor Cases)',
    type: 'CHILD-SAFETY',
    description: 'Specialized filing checklist and draft set for minor survivor workflows.',
  },
];
