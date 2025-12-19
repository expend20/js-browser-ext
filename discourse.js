async function fetchDiscourseCategories(settings) {
  console.log('fetchDiscourseCategories called with settings:', {
    discourseApiUrl: settings?.discourseApiUrl,
    discourseApiUsername: settings?.discourseApiUsername,
    hasApiKey: !!settings?.discourseApiKey,
  });

  const { discourseApiUrl, discourseApiKey, discourseApiUsername } = settings || {};

  if (!discourseApiUrl || !discourseApiKey || !discourseApiUsername) {
    console.log('Discourse settings are not fully configured for fetching categories.');
    return { success: false, error: 'Discourse settings incomplete', categories: [] };
  }

  const url = `${discourseApiUrl}/categories.json?include_subcategories=true`;
  console.log('Fetching categories from:', url);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Api-Key': discourseApiKey,
        'Api-Username': discourseApiUsername,
      },
    });

    console.log('Fetch response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fetch error response body:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Discourse API response data:', data);

    const categories = [];
    const processCategory = (cat, parentName = null) => {
      const displayName = parentName ? `${parentName} / ${cat.name}` : cat.name;
      categories.push({
        id: cat.id,
        name: displayName,
        slug: cat.slug,
        description: cat.description_excerpt || '',
      });
      // Process subcategories if they exist
      if (cat.subcategory_list && cat.subcategory_list.length > 0) {
        cat.subcategory_list.forEach(subcat => processCategory(subcat, displayName));
      }
      if (cat.subcategories && cat.subcategories.length > 0) {
        cat.subcategories.forEach(subcat => processCategory(subcat, displayName));
      }
    };

    (data.category_list?.categories || []).forEach(cat => processCategory(cat));

    console.log('Parsed categories:', categories);
    return { success: true, categories };
  } catch (error) {
    console.error('Error fetching Discourse categories:', error);
    return { success: false, error: error.message, categories: [] };
  }
}

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
    console.log('Posting to Discourse:', title);
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
