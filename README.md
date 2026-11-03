# AI Inventory Forecasting & Spoilage Risk Dashboard

Working prototype for TEB2023 Artificial Intelligence (Group 12, Universiti Teknologi PETRONAS).
It predicts tomorrow's demand at UTP Student Village cafeterias and flags perishable stock at risk of spoiling.

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | The dashboard page |
| `style.css` | How the page looks |
| `app.js` | Runs the AI model in the browser, plus the spoilage risk rules |
| `model.js` | The trained scikit-learn decision tree, plus survey figures (auto-generated) |
| `synthetic_cafeteria_data.csv` | The 252-row synthetic training dataset |
| `training/train_model.py` | Python script that builds the data, trains the model and writes `model.js` |

## How it works

1. `training/train_model.py` reads our 34-response student survey and the vendor interview figures.
   It builds a 9-week synthetic sales history and trains a scikit-learn `DecisionTreeRegressor`.
2. The trained tree's split rules are exported to `model.js`. The script checks that the export
   gives exactly the same predictions as scikit-learn.
3. The website walks the same tree in JavaScript, so it needs no server and runs free on Vercel.

## Preview on your computer

Double-click `index.html`. It opens in your browser and works offline.

## Deploy on Vercel

1. Upload all files in this folder to a new GitHub repository.
2. On vercel.com, choose **Add New → Project**, import the repository, keep **Framework Preset: Other**,
   and click **Deploy**.

## Change the model

```bash
pip install pandas scikit-learn numpy openpyxl
python training/train_model.py
```

Then upload the new `model.js` and `synthetic_cafeteria_data.csv` to GitHub. Vercel redeploys automatically.

**Data note:** all sales and waste data is SIMULATED from our study figures. The prototype is for coursework only.
