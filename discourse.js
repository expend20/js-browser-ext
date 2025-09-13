async function postToDiscourse(settings, title, text, imageContent = null) {
  const { discourseApiUrl, discourseApiKey, discourseApiUsername, discourseCategoryId } = settings;

  if (!discourseApiUrl || !discourseApiKey || !discourseApiUsername || !discourseCategoryId) {
    console.log('Discourse settings are not fully configured. Skipping post.');
    return;
  }

  let imageUrl = '';
  if (imageContent && imageContent.data) {
    try {
      const fetchRes = await fetch(imageContent.dataUrl);
      const blob = await fetchRes.blob();
      
      const formData = new FormData();
      formData.append('file', blob, 'screenshot.png');
      formData.append('type', 'composer');

      const uploadResponse = await fetch(`${discourseApiUrl}/uploads.json`, {
        method: 'POST',
        headers: {
          'Api-Key': discourseApiKey,
          'Api-Username': discourseApiUsername,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Failed to upload image to Discourse: ${uploadResponse.statusText}, ${errorText}`);
      }

      const uploadResult = await uploadResponse.json();
      if (uploadResult.url) {
        imageUrl = uploadResult.url;
      }
    } catch (error) {
      console.error('Error uploading image to Discourse:', error);
    }
  }

  let rawContent = text;
  if (imageUrl) {
    rawContent = `![image](${imageUrl})\n\n${text}`;
  }

  const postData = {
    title: title,
    raw: rawContent,
    category: discourseCategoryId,
  };

  try {
    const postResponse = await fetch(`${discourseApiUrl}/posts.json`, {
      method: 'POST',
      headers: {
        'Api-Key': discourseApiKey,
        'Api-Username': discourseApiUsername,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postData),
    });

    if (!postResponse.ok) {
        const errorText = await postResponse.text();
        throw new Error(`Failed to create post on Discourse: ${postResponse.statusText}, ${errorText}`);
    }

    const postResult = await postResponse.json();
    console.log('Successfully posted to Discourse:', postResult);

  } catch (error) {
    console.error('Error posting to Discourse:', error);
  }
}
