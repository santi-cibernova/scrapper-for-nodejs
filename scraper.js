const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const openai = require('openai');

const supabaseUrl = 'https://<your-supabase-url>.supabase.co';
const supabaseKey = 'your-supabase-key';
const supabase = createClient(supabaseUrl, supabaseKey);

openai.apiKey = 'your-openai-key';

module.exports = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Missing URL parameter' });
    }

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url);

    const scrapedData = await page.evaluate(() => {
      try {
        const bodyContent = document.body ? document.body.innerHTML : 'Body not found';
        return bodyContent;
      } catch (error) {
        return `Error in page evaluation: ${error}`;
      }
    });

    await browser.close();

    // Split the scraped data into chunks
    const chunks = [];
    for (let i = 0; i < scrapedData.length; i += 1900) {
      const chunk = scrapedData.slice(i, i + 2000);
      chunks.push(chunk);
    }

    // Generate embeddings for each chunk and save them to a Supabase table
    for (const chunk of chunks) {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: chunk,
        encoding_format: "float",
      });

      if (!('data' in embeddingResponse && Array.isArray(embeddingResponse.data))) {
        console.error('Invalid embedding response:', embeddingResponse);
        continue;
      }

      const embedding = embeddingResponse.data[0].embedding;

      try {
        await supabase.from('scraped_data').insert({
          content: chunk,
          embedding,
        });
      } catch (error) {
        console.error('Error inserting data into Supabase:', error);
      }
    }

    res.status(200).json({ message: 'Scraped data saved successfully' });
  } catch (error) {
    console.error(`Failed to scrape webpage: ${error}`);
    res.status(500).json({ error: `Failed to scrape webpage: ${error}` });
  }
};