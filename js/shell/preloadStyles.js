/**
 * preloadStyles.js — Manifest of all primitive, compound, and block styles
 * that must be preloaded at startup to prevent FOUC (Flash of Unstyled Content).
 */

export const PRELOAD_COMPONENT_STYLES = [
  // Primitives
  'js/components/Primitives/MpiButton/MpiButton.css',
  'js/components/Primitives/MpiIcon/MpiIcon.css',
  'js/components/Primitives/MpiBadge/MpiBadge.css',
  'js/components/Primitives/MpiSpinner/MpiSpinner.css',
  'js/components/Primitives/MpiProgressBar/MpiProgressBar.css',
  'js/components/Primitives/MpiInput/MpiInput.css',
  'js/components/Primitives/MpiDropdown/MpiDropdown.css',
  'js/components/Primitives/MpiRadioGroup/MpiRadioGroup.css',
  'js/components/Primitives/MpiColorPicker/MpiColorPicker.css',
  'js/components/Primitives/MpiPopup/MpiPopup.css',
  'js/components/Primitives/MpiToast/MpiToast.css',
  'js/components/Primitives/MpiOverlay/MpiOverlay.css',
  'js/components/Primitives/MpiRadialMenu/MpiRadialMenu.css',
  'js/components/Primitives/MpiModal/MpiModal.css',
  'js/components/Primitives/MpiMediaDropOverlay/MpiMediaDropOverlay.css',
  'js/components/Primitives/MpiProjectDropOverlay/MpiProjectDropOverlay.css',
  'js/components/Primitives/MpiCheckbox/MpiCheckbox.css',
  'js/components/Primitives/MpiMaskedImagePreview/MpiMaskedImagePreview.css',

  // Compounds
  'js/components/Compounds/MpiContextMenu/MpiContextMenu.css',
  'js/components/Compounds/MpiOptionSelector/MpiOptionSelector.css',
  'js/components/Compounds/MpiOkCancel/MpiOkCancel.css',
  'js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.css',
  'js/components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.css',
  'js/components/Compounds/MpiModelSettings/MpiModelSettings.css',
  'js/components/Compounds/MpiProjectName/MpiProjectName.css',
  'js/components/Compounds/MpiProjectCard/MpiProjectCard.css',
  'js/components/Compounds/MpiNewProject/MpiNewProject.css',
  'js/components/Compounds/LandingPages/MpiSettings/MpiSettings.css',
  'js/components/Compounds/LandingPages/MpiHelp/MpiHelp.css',
  'js/components/Compounds/LandingPages/MpiAbout/MpiAbout.css',
  'js/components/Compounds/MpiSlideOver/MpiSlideOver.css',
  'js/components/Compounds/MpiStartingComfy/MpiStartingComfy.css',
  'js/components/Compounds/MpiEngineInstall/MpiEngineInstall.css',
  'js/components/Compounds/MpiErrorDialog/MpiErrorDialog.css',
  'js/components/Compounds/MpiCompareOverlay/MpiCompareOverlay.css',
  'js/components/Compounds/MpiHistoryTools/MpiHistoryTools.css',
  'js/components/Compounds/MpiAutoMaskThumbs/MpiAutoMaskThumbs.css',
  'js/components/Compounds/MpiHistoryList/MpiHistoryList.css',
  'js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.css',
  'js/components/Compounds/MpiViewerCorners/MpiViewerCorners.css',
  'js/components/Compounds/MpiTrimBar/MpiTrimBar.css',
  'js/components/Compounds/MpiVideoSurface/MpiVideoSurface.css',
  'js/components/Compounds/MpiVideoControlBar/MpiVideoControlBar.css',

  // Organisms
  'js/components/Organisms/MpiPromptBox/MpiPromptBox.css',
  'js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.css',
  'js/components/Organisms/MpiVideoViewer/MpiVideoViewer.css',
  'js/components/Organisms/MpiToolOptionsCrop/MpiToolOptionsCrop.css',
  'js/components/Organisms/MpiToolOptionsMask/MpiToolOptionsMask.css',
  'js/components/Organisms/MpiToolOptionsUpscale/MpiToolOptionsUpscale.css',
  'js/components/Organisms/MpiToolOptionsInterpolate/MpiToolOptionsInterpolate.css',
  'js/components/Organisms/MpiToolOptionsResize/MpiToolOptionsResize.css',
  'js/components/Organisms/MpiToolOptionsPrompt/MpiToolOptionsPrompt.css',

  // Blocks
  'js/components/Blocks/MpiModelsModal/MpiModelsModal.css',
  'js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.css',
  'js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.css',

];

/**
 * Injects <link> tags for all shared component CSS files.
 * @param {string[]} [paths=PRELOAD_COMPONENT_STYLES] - Optional custom paths
 */
export function preloadComponentStyles(paths = PRELOAD_COMPONENT_STYLES) {
  const head = document.head;
  paths.forEach(path => {
    if (head.querySelector(`link[href="${path}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = path;
    head.appendChild(link);
  });
}
