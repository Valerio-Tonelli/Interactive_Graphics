// bgImg is the background image to be modified.
// fgImg is the foreground image.
// fgOpac is the opacity of the foreground image.
// fgPos is the position of the foreground image in pixels. It can be negative and (0,0) means the top-left pixels of the foreground and background are aligned.

function composite(bgImg, fgImg, fgOpac, fgPos) {
    // Check if the background image is valid
    if (!bgImg || !bgImg.data || !bgImg.width || !bgImg.height) {
      throw new Error("Invalid background image");
    }   
    // If opacity is 0, no need to do anything
    if (fgOpac === 0) return;
    
    // For each pixel in the foreground image
    for (let fgY = 0; fgY < fgImg.height; fgY++) {
      // Calculate the corresponding Y position on the background
      const bgY = fgY + fgPos.y;
      
      // if this row is outside the background image bounds, skip it
      if (bgY < 0 || bgY >= bgImg.height) continue;
      
      for (let fgX = 0; fgX < fgImg.width; fgX++) {
        // Calculate the corresponding X position on the background
        const bgX = fgX + fgPos.x;
        
        // if this column is outside the background image bounds, skip it
        if (bgX < 0 || bgX >= bgImg.width) continue;
        
        // RGBA format is 4 bytes per pixel (R, G, B, A)
        // Calculate the index for the background and foreground images
        const bgIndex = (bgY * bgImg.width + bgX) * 4;
        const fgIndex = (fgY * fgImg.width + fgX) * 4;
        
        const fgAlpha = (fgImg.data[fgIndex + 3] / 255) * fgOpac;
        
        // If the foreground pixel is fully transparent, skip it
        if (fgAlpha === 0) continue;
        
        // If opacity is 100%, just copy it
        // bgIndex, bgIndex + 1, bgIndex + 2 are the indices for R, G, B channels respectively
        // bgIndex + 3 is the index for the alpha channel
        if (fgAlpha === 1) {
          bgImg.data[bgIndex] = fgImg.data[fgIndex];
          bgImg.data[bgIndex + 1] = fgImg.data[fgIndex + 1];
          bgImg.data[bgIndex + 2] = fgImg.data[fgIndex + 2];
          bgImg.data[bgIndex + 3] = 255;
        } else {
          const bgAlpha = bgImg.data[bgIndex + 3] / 255;
          
          // Calculate the new alpha usign the alpha compositing formula 
          // result = (foreground × alpha) + (background × (1 - alpha))
          const outAlpha = fgAlpha + bgAlpha * (1 - fgAlpha);
          
          if (outAlpha > 0) {
            for (let c = 0; c < 3; c++) {
              bgImg.data[bgIndex + c] = Math.round(
                (fgImg.data[fgIndex + c] * fgAlpha + 
                 bgImg.data[bgIndex + c] * bgAlpha * (1 - fgAlpha)) / outAlpha
              );
            }
            bgImg.data[bgIndex + 3] = Math.round(outAlpha * 255);
          }
        }
      }
    }
  }