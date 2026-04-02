## Comfy mappings
If an existing control in the app does not exist in the workflow, 
gray it out (disable it) | hide it

# add pre resources for comfyui installation??
detectors for example (they are small and would be a lot to download all of them)

## Reintroduce Enhancer
# Presets for the enhancer
- SDXL
- FLUX 
- NANO BANANA
- WAN
- LTX
- KLING
- SEEDANCE

## Custom ComfyUI Workflows (auto detect and create params)???
## One Trainer integration (with possible RunPod connection)


## Console log Terminal (context menu access?)

## Add generation time in history


## Drag to tool
Drag any image to a specific tool
## * Introduce Project templates *

## Patreon integration
### Sign in
### Access to exclusives depending on tiers
### Make sure to have a version with everything for YT Creators


# FIXES
* unload cache from comfy as well as models (Maybe done, not sure)







create and only implement in the test page: @beautifulMention the following primitives:
slider/range (listen to mouse wheel)
Toast (brief notifications that disappear)







Prompting MpiAiSuite Agents — Gemini Flash Guide
Flash is fast but context-light. These patterns get the best results:

Start every session with the slash command
/start
This forces the agent to read 02_status.md and 01_overview.md before touching anything. Without it, Flash will guess at the architecture and often get it wrong.

Be specific about the file, symptom, and expected behavior
❌ "the upscaler is broken"
✅ "upscaler: when I drop an image the canvas stays empty. No error in console. It worked before I changed the seed logic in upscaler.js"

Flash doesn't explore well — give it the file name and the symptom together.

One problem per session
Flash loses track fast across many edits. One bug or one feature per session, then /finish.

Name the tool you want to use
❌ "add a setting for that"
✅ "add a max-steps slider to the Upscaler tool — in templates/tpl-upscaler.html and js/tools/upscaler.js"

If the agent starts touching the wrong files, stop it immediately
Say: "don't touch shell.js, fix it only in [file]". Flash will often over-reach into files it shouldn't.

Testing handoff phrase
After any fix, if the agent doesn't say "please test", nudge it:
"hand off to me for testing"

Reference the workflow directly for new tools
/implement_new_tool
Flash follows step-by-step instructions reliably when they're this explicit.





## Crop Extract: Extra features
in our ctx menu and actions we need to implement a new action and option, the usual save action/option should save the video at its current state (timeline crop and ratio crop) as a mp4 file and we need to implement in the existing menu a new action (Save Frame) both should save the respective file type in the library. the tools displayed in the ctx menu should @beautifulMention @beautifulMention 






# Convert this plan into executable engineering tasks .md file

















## read dev_docs/01_overview.md
Page/Tool: Crop & Extract
Goals:
1. add a + icon in the control layout on the far left, this icon should trigger the modal media library. Use the already implemented tools and componets and keep consistency with other pages that use the same icon/button.
2. remove the interaction: left click on the video area that is not cropped opens the library modal, it should do nothing
3. remove the button icon: Extract Clip (MP4)
4. The following options should only be changed/added to the ctx menu while in the cropExtract page.
4.1. add option to ctx menu: Save Video
4.2. add option to ctx menu: Download Video
4.3. change option display name in ctx menu: Save (change to Save Frame)
4.4. change option display name in ctx menu: Download (change to Download Frame)
5. Add audio control: a speaker icon to the left of the play button that when hovered displays a vertical slider to control audio with click drag and mouse wheel

Critical: keep style consistency for both dark and light mode, use what is already there, keep a modular approach and avoid copy paste code or placing code in places where are not related.

Most Relevant files:
cropExtract.js
mediaActions.js
mediaContextMenu.js
tpl-cropExtract.html
toolUtils.js









## Tool: cropExtract
Goals:
1. fix issue where the vertical volume slider displays compressed and horizontaly (image 1 as reference)
2. fix ratio state - issue: when navigating to another page and returning the ratio display returns to default
3. fix media galery and modal display of videos (videos get cropped not displaying their correct ratios)
4. fix issue of context menu: downloading a video also saves to library
5. fix video preview modal - upon opening a video, it display to the right and user cant relocate its position and if an image was previously previewed it also displays as you can see in image 2




## Detailer comeback

ok so you know the layout from the tpl-detailer.html file, the only thing missing is the Detect button under the Masking control dropdown.
The masking control dropdown options (apart from manual) should be mapped to the comfyui node named "sams" and tells comfy winch model to select if not manual. I added the model names in the value of each option on line 43 to 45, only missing the .pt extension.
note keep in mind the comfyui engine can be off when visiting this page so it should only be sent to comfy when runing the workflow.
Back to the missing "Detect" button, when pressed by the user it should turn the "Ready" node to false and run the workflow, this will return from comfy node "Detected" images that were detected, if any, these are meant to be placed in small thumbnails under the detect button, they need to be selectable with a visual indication that they are, and when each one is selected or de-selected the following needs to happen: 
The Ready node needs to be set to false
The workflow needs to run again 
The Output_Mask needs to be retrieved from comfy and placed (Inverted) over the current image that should be in the source image input of the page, so that the selected/masked areas are showed and all that is not masked is darker.
Back to the SOurce image input on the page, it needs to accept drag and drop, on click, if it has no image it opens the media library popup for the user to select an existing image, if it has an image it opens the image previewer modal in mask mode. the image preview modal has a send to detailer button that can also be triggered by pressing enter and has the funtion to place the current image and drawn mask in the source image input of the page with the drawn mask represented on it, this event should automatically set the masking control dropdown to manual.
When the user submits the workflow using the arrow button on the prompt box the Ready comfy boolean should be set to true and the workflow should then be submited.
we should then receive latent previews of the generation in real time on the canvas, once finished we should get a comparision slider like the Compare tool has (and the upscaler tool should have but its broken at the moment) to compare the original image and the new detailed image, and we should also have an arrow to send the new image back to the source image input like the upscaler has (or should have) next ot the source image text. 
the new implemented feature of right click on a image should work on the source image and on the canvas, the Compare tool has this working atm, on the canvas even displaying 2 images to compare the system can tell winch image is being hovered on right click and affect only that image with its actions.
Because I only noticed the issue as I was writting this, please keep in mind the upscaler is not showing the latent previews or functioning correctly, needs to be adressed at a later date, for now lets focus on implementing the detailer back into the app.

note: atm when visiting the detailer page this error pops up in the console:
shell.js:454 [shell] detailer init failed: TypeError: Cannot read properties of null (reading 'appendChild')
    at new InteractiveCanvas (interactiveCanvas.js:12:24)
    at initDetailer (detailer.js:48:20)
    at shell.js:454:39

the prompt box does not seem to have text box, its + icon to access the library is present but does nothing on click, after it there should be a checkmark icon toggle like the upscaler has, then the power slider only responds to mouse events on top of the slider, it should respond to events on its parent container, then we have the seed icon button, the same seed should always be sent to comfy unless this icon is clicked, when clicked it should generate a new static seed to send to comfy node named "Seed", then we have the disk icon to save to library, this icon should be removed from the detailer and the upscaler as we now have the right click menu that does that with the save option. and finally the submit arro icon button to start the workflow, that should have the same beahviour that the generator and the upscaler have that pressed starts the workflow and displays a red stop button and pressed while in this state cancels the comfy workflow.

I think I covered everything if not ask away and make an implementation plan for this please.
Remember the app was recently refactored and its modular with many moving parts that can and should be reused/imported, avoid repeat code at all costs.

ps: if didnt mentioned yet, latent previews are working on the generator tool, just not on the upscaler