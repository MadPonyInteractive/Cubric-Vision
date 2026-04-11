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
  'js/components/Primitives/MpiPopup/MpiPopup.css',
  'js/components/Primitives/MpiToast/MpiToast.css',
  'js/components/Primitives/MpiScrollableBox/MpiScrollableBox.css',
  'js/components/Primitives/MpiMediaDropzone/MpiMediaDropzone.css',
  'js/components/Primitives/MpiDragList/MpiDragList.css',
  'js/components/Primitives/MpiOverlay/MpiOverlay.css',
  'js/components/Primitives/MpiProjectsPageOverlay/MpiProjectsPageOverlay.css',
  'js/components/Primitives/MpiRadialMenu/MpiRadialMenu.css',
  'js/components/Primitives/MpiModal/MpiModal.css',

  // Compounds
  'js/components/Compounds/MpiGroupCard/MpiGroupCard.css',
  'js/components/Compounds/MpiSelectionBar/MpiSelectionBar.css',
  'js/components/Compounds/MpiVolumeControl/MpiVolumeControl.css',
  'js/components/Compounds/MpiRatioSelector/MpiRatioSelector.css',
  'js/components/Compounds/MpiToolbar/MpiToolbar.css',
  'js/components/Compounds/MpiCameraConfig/MpiCameraConfig.css',
  'js/components/Compounds/MpiLightingConfig/MpiLightingConfig.css',
  'js/components/Compounds/MpiStyleConfig/MpiStyleConfig.css',
  'js/components/Compounds/MpiVideoScene/MpiVideoScene.css',
  'js/components/Compounds/MpiOkCancel/MpiOkCancel.css',
  'js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.css',
  'js/components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.css',
  'js/components/Compounds/MpiModelSettings/MpiModelSettings.css',
  'js/components/Compounds/MpiProjectName/MpiProjectName.css',
  'js/components/Compounds/MpiProjectCard/MpiProjectCard.css',
  'js/components/Compounds/MpiNewProject/MpiNewProject.css',
  'js/components/Compounds/MpiModelsModal/MpiModelsModal.css',
  'js/components/Compounds/LandingPages/MpiSettings/MpiSettings.css',
  'js/components/Compounds/LandingPages/MpiHelp/MpiHelp.css',
  'js/components/Compounds/LandingPages/MpiAbout/MpiAbout.css',
  'js/components/Compounds/MpiStartingComfy/MpiStartingComfy.css',
  'js/components/Compounds/MpiErrorDialog/MpiErrorDialog.css',
  'js/components/Compounds/MpiCompareOverlay/MpiCompareOverlay.css',
  'js/components/Compounds/MpiHistoryTools/MpiHistoryTools.css',
  'js/components/Compounds/MpiToolActionBar/MpiToolActionBar.css',
  'js/components/Compounds/MpiAutoMaskThumbs/MpiAutoMaskThumbs.css',

  // Blocks
  'js/components/Blocks/MpiPromptBox/MpiPromptBox.css',
  'js/components/Blocks/MpiVideoPlayer/MpiVideoPlayer.css',
  'js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.css',
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
