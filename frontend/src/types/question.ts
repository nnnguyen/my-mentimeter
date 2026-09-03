export type JoiningInfoType = 'QR_CODE' | 'LINK' | 'CODE';
export type ResultVisibility = 'INSTANT' | 'ON_CLICK' | 'PRIVATE';
export type QuestionStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export interface Question {
  id: string;
  topicId: string;
  order: number;
  prompt: string;
  status: QuestionStatus;
  type: 'WORD_CLOUD';
  responseLimit: number | null;
  maxWordLength: number;
  allowDuplicateFromSameUser: boolean;
  backgroundColor: string;
  questionColor: string | null;
  textColorScheme: string;
  showLogo: boolean;
  maxWordsDisplayed: number;
  showJoiningInfo: boolean;
  joiningInfoType: JoiningInfoType;
  resultVisibility: ResultVisibility;
  resultsRevealed: boolean;
  showResultsToAudience: boolean;
}

// Fields the editor can PATCH. Mirrors backend UpdateQuestionDto (minus
// `status`/`type`, which this page doesn't expose any control for).
export type QuestionPatch = Partial<
  Pick<
    Question,
    | 'prompt'
    | 'responseLimit'
    | 'maxWordLength'
    | 'allowDuplicateFromSameUser'
    | 'backgroundColor'
    | 'questionColor'
    | 'textColorScheme'
    | 'showLogo'
    | 'maxWordsDisplayed'
    | 'showJoiningInfo'
    | 'joiningInfoType'
    | 'resultVisibility'
  >
>;

export const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';
export const DEFAULT_TEXT_COLOR_SCHEME = 'default';
