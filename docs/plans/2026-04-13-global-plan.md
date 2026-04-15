---
name: global-plan
created: 2026-04-13T00:00:00.000Z
owner: human
status: complete
---
## Goal
Fix small bugs left behind or add features that are missing due to misinterpretation 

## To-Dos
- [x] The block component `../../js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` Needs buttons/tabs on the top left So the user can organize the gallery by oldest, newest, images, video, favourites and later on when audio is implemented, audio. (default should be newest to oldest)
- [x] Change the galery grid to respect image ratios
- [x] The `../../js/components/Blocks/MpiModelsModal/MpiModelsModal.js` has a nice icon, title and description, add the same to `../../js/components/Compounds/MpiModelSettings/MpiModelSettings.js` [settings icon, "Model Settings", "Setup your custom upscale model and loras here."]
- [x] The comapre tool toolbar in the group history display is injected into the history pannel instead of showing in place of the MpiPromptBox like it does on the main gallery. 
- [x] When multiple models are installed as a consequence of having the same dependencies as the model that the user installed, the Mpi Toast displays only the model that was installed. It would be good to display all the models that were installed as a consequence of having installed that one model. (open to discussion -> possibility to change the mpitoast behaviour to a multiple toast with a max of 3 toasts stacked) 

## Notes
<!-- Free-form notes, context, links to docs -->