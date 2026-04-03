## Tasks for refactoring components that did not followed the correct design pattern
Note: executed between 3.3 and 2.5

for agents: FIRST READ -> `/dev_docs/05_components.md`

### Stage 1
[x] Merge MpiIconButton into MpiButton
[x] Separate icon logic from MpiIcon and place it in utils/icons.js
[x] Update consumers

### Stage 2
[x] Move MpiPromptBox from Blocks to Compounds
[x] Merge MpiSlider into MpiProgressBar

### Stage 3.1
[x] Move MpiVideoPlayer to Blocks
[x] update js/components/types.js by tackling the fact that MpiIconButton was previously merged into MpiButton and checking if all current components are accounted for
[x] review js/shell.js making sure preloadComponentStyles() contains all styles correctly

### Stage 3.2
[x] Add funtionality to MpiPopup, give it props and the ability to be more flexible:
    - popup on the left/top/right/bottom
    - have a list to place other elements inside it
    - resize to contents
    - enter/leave/click events
[x] Make consumers create their own button+popup logic using the new MpiPopup and a MpiButton to remove their MpiPopupButton dependency
[x] Remove MpiPopupButton 


### Stage 4
[x] Convert MpiScrollableBox to a Primitive and remove MpiButton dependency
[x] Update MpiScrollableBox consumers to point to its new location
[x] Remove old MpiScrollableBox

### Stage 5
[x] Remove MpiMediaDropzone MpiIcon dependency by using "js/utils/icons.js"
[x] Convert MpiMediaDropzone to a Primitive 
[x] Update MpiMediaDropzone consumers to point to its new location

### Stage 6 
[x] Convert MpiRatioSelector to a Compound
[x] Convert MpiDropdown to a Compound

### Stage 7
[x] Remove MpiDragList MpiIcon dependency by using "js/utils/icons.js"
[x] Convert MpiDragList to a Primitive
[x] Update MpiDragList consumers to point to its new location

continues in `../tasks/componets-refactor.md`