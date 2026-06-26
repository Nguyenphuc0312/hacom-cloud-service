/**
 * PHASE 2A — Audio Recorder POC Page Wrapper
 *
 * Standalone page that renders the POC component.
 * Mount at /poc/audio during development.
 */

import { AudioRecorderPoc } from "./AudioRecorderPoc";

export const AudioRecorderPocPage: React.FC = () => {
  return <AudioRecorderPoc />;
};

export default AudioRecorderPocPage;
