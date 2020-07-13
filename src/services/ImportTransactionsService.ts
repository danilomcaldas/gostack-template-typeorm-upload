import {getCustomRepository, getRepository, In} from 'typeorm'
import fs from 'fs';
import csvParse from 'csv-parse';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

import TransactionRepository from '../repositories/TransactionsRepository';



interface CVSTransaction{
  title : string;
  type : 'income' | 'outcome';
  value : number;
  category : string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionRepository = getCustomRepository(TransactionRepository);
    const categoriesRepository = getRepository(Category);

    const contactsReadStream = fs.createReadStream(filePath);

    const parsers = csvParse({
      from_line: 2,
    });

    const parseCSV = contactsReadStream.pipe(parsers);

    const transactions: CVSTransaction[] = [];
    const categories : string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim()
      );
      if (!title || !type || !value) return;


      categories.push(category);

      transactions.push({title, type, value, category});

    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const existCategories = await categoriesRepository.find({
      where : {
        title: In(categories),
      }
    });

    const categoriesTitle = existCategories.map(
      (category : Category) => category.title
    )

    const addCategoryForTitle = categories.filter(
      category => !categoriesTitle.includes(category),
    ).filter((value, index, self)=> self.indexOf(value) ===index);

    
    const newCategories = categoriesRepository.create(
      addCategoryForTitle.map(title =>({
        title,
      })),
    );

    await categoriesRepository.save(newCategories);
    
    const finalCategories =[...newCategories, ...existCategories];

    const createdTransactions = transactionRepository.create(
      transactions.map(transaction => ({
        title : transaction.title,
        type : transaction.type,
        value : transaction.value,
        category : finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );
    
    await transactionRepository.save(createdTransactions);
    
    await fs.promises.unlink(filePath);

    return createdTransactions;

  }

  
}

export default ImportTransactionsService;
